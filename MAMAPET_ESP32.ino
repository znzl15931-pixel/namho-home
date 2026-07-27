/*
 * ==============================================================================
 *  프로젝트명: MAMAPET - ESP32 스마트 펫 급식기 (초음파 사료 잔량 + PIR 식사 감지)
 *  플랫폼: ESP32 + Blynk IoT + OLED(SSD1306) + Servo + Passive Buzzer + PIR Sensor + HC-SR04
 * ==============================================================================
 *  [📌 ESP32 회로 핀 연결 가이드 (Pinout Map)]
 * 
 *  1. OLED 디스플레이 (SSD1306 I2C 128x64)
 *     - VCC -> ESP32 3.3V
 *     - GND -> ESP32 GND
 *     - SDA -> GPIO 21
 *     - SCL -> GPIO 22
 * 
 *  2. 서보 모터 (SG90 - 급식 도어 제어)
 *     - VCC (빨강) -> ESP32 5V (VIN)
 *     - GND (갈색/검정) -> ESP32 GND
 *     - Signal (주황/노랑) -> GPIO 18
 * 
 *  3. 수동 부저 (Passive Buzzer - 알림 멜로디)
 *     - + (신호선) -> GPIO 19
 *     - - (지상선) -> ESP32 GND
 * 
 *  4. PIR 움직임 감지 센서 (HC-SR501)
 *     - VCC -> ESP32 3.3V 또는 5V
 *     - GND -> ESP32 GND
 *     - OUT (디지털 신호) -> GPIO 27
 * 
 *  5. [신규] 초음파 거리 센서 (HC-SR04 - 뚜껑 사료 잔량 감지)
 *     - VCC -> ESP32 5V (또는 3.3V)
 *     - GND -> ESP32 GND
 *     - TRIG (송신) -> GPIO 5
 *     - ECHO (수신) -> GPIO 4
 * ==============================================================================
 *  [Blynk 가상 핀 (Virtual Pins)]
 *  - V1 : 오늘의 급식 카운터 ("2/3")
 *  - V2 : 원격 수동 급식 버튼
 *  - V3~V9 : 다중 스케줄러 & 멜로디 설정
 *  - V10: 식사 상태 ("ATE(식사 중/완료)", "SKIPPED(미섭취)", "WATCHING")
 *  - V11: PIR 실시간 움직임 (0/1)
 *  - V12: 초음파 사료 잔량 퍼센트 (0~100%)
 *  - V13: 사료 부족 경고 상태 ("NORMAL", "WARNING: REFILL FOOD")
 * ==============================================================================
 */

#define BLYNK_TEMPLATE_ID           "TMPL_MAMAPET_01"
#define BLYNK_TEMPLATE_NAME         "MAMAPET Feeder"
#define BLYNK_AUTH_TOKEN            "Your_Blynk_Auth_Token_Here"

#include <WiFi.h>
#include <WiFiClient.h>
#include <BlynkSimpleEsp32.h>
#include <WidgetRTC.h>
#include <TimeLib.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>

// 1. 하드웨어 핀 및 상수 정의
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define OLED_ADDRESS  0x3C

#define SERVO_PIN     18
#define BUZZER_PIN    19
#define PIR_PIN       27
#define TRIG_PIN      5      // 초음파 센서 Trig 핀
#define ECHO_PIN      4      // 초음파 센서 Echo 핀

#define MAX_SCHEDULES 4

// 뚜껑 초음파 사료 잔량 기준 거리 (cm)
#define FOOD_FULL_DIST_CM   4.0   // 사료 가득 참 (100%)
#define FOOD_EMPTY_DIST_CM 24.0   // 사료 바닥 남 (0%)

// 움직임 감지 시각 기준 (5분 = 300초, 1시간 = 3600초)
#define EATING_MOTION_THRESHOLD_SEC 300  // 5분 이상 감지 시 식사 중
#define NO_MOTION_TIMEOUT_SEC       3600 // 1시간 동안 무반응 시 미섭취

// 2. 글로벌 객체 생성
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Servo feedServo;
BlynkTimer timer;
WidgetRTC rtc;

// 3. 시스템 상태 변수
char wifiSsid[] = "Your_WiFi_SSID";
char wifiPass[] = "Your_WiFi_Password";

int todayFeedCount = 0;        
int targetFeedCount = 3;       
int selectedMelody = 1;        
bool isFeeding = false;        
int lastResetDay = -1;         

// 초음파 사료 잔량 변수
int foodPercent = 100;
bool isFoodLowWarning = false;

// PIR 움직임 감지 상태 변수
int continuousMotionSec = 0;      // 연속/누적 움직임 시간 (초)
int noMotionSec = 0;              // 움직임 없음 지속 시간 (초)
String currentMealStatus = "READY"; // "READY", "EATING" (5분 감지), "SKIPPED" (1시간 무반응)

// 다중 스케줄 구조체 및 배열
struct ScheduleSlot {
  bool enabled;
  int startSec;
  bool triggeredToday;
};

ScheduleSlot schedules[MAX_SCHEDULES] = {
  { true,  8 * 3600, false }, // 1차 08:00
  { true, 13 * 3600, false }, // 2차 13:00
  { true, 19 * 3600, false }, // 3차 19:00
  { false, 21 * 3600, false } // 4차 21:00
};

// 4. 음표 주파수 정의
#define NOTE_C4  262
#define NOTE_E4  330
#define NOTE_G4  392
#define NOTE_C5  523
#define NOTE_E5  659
#define NOTE_G5  784

void playMelody1() {
  int notes[] = {NOTE_C4, NOTE_E4, NOTE_G4, NOTE_C5, NOTE_E5, NOTE_G5};
  int durations[] = {100, 100, 100, 120, 120, 250};
  for (int i = 0; i < 6; i++) {
    tone(BUZZER_PIN, notes[i], durations[i]);
    delay(durations[i] * 1.2);
  }
  noTone(BUZZER_PIN);
}

void playMelody2() {
  int notes[] = {NOTE_E4, NOTE_G4, NOTE_C5, NOTE_E5};
  int durations[] = {150, 150, 150, 300};
  for (int i = 0; i < 4; i++) {
    tone(BUZZER_PIN, notes[i], durations[i]);
    delay(durations[i] * 1.3);
  }
  noTone(BUZZER_PIN);
}

void playMelody3() {
  tone(BUZZER_PIN, NOTE_C5, 120);
  delay(150);
  tone(BUZZER_PIN, NOTE_G5, 200);
  delay(220);
  noTone(BUZZER_PIN);
}

void playSelectedMelody() {
  if (selectedMelody == 1) playMelody1();
  else if (selectedMelody == 2) playMelody2();
  else playMelody3();
}

// ==============================================================================
// 5. 초음파 센서 사료 잔량 측정 함수
// ==============================================================================
int readFoodLevelPercent() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30ms 타임아웃
  if (duration == 0) return foodPercent; // 측정 실패 시 기존 값 유지
  
  float distanceCm = duration * 0.034 / 2.0;
  
  // 거리를 0% ~ 100% 잔량으로 변환
  float pct = (FOOD_EMPTY_DIST_CM - distanceCm) / (FOOD_EMPTY_DIST_CM - FOOD_FULL_DIST_CM) * 100.0;
  if (pct > 100.0) pct = 100.0;
  if (pct < 0.0) pct = 0.0;
  
  return (int)pct;
}

// ==============================================================================
// 6. OLED 화면 그리기 함수
// ==============================================================================
void drawNormalScreen() {
  display.clearDisplay();
  
  // 헤더
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print("MAMAPET [STATUS]");
  
  display.setCursor(95, 0);
  display.print(foodPercent);
  display.print("%");
  
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  // 오늘 급식 카운트
  display.setCursor(0, 16);
  display.print("FEED COUNT: ");
  display.print(todayFeedCount);
  display.print("/");
  display.print(targetFeedCount);
  
  // 식사 상태
  display.setCursor(0, 28);
  display.print("MEAL: ");
  display.print(currentMealStatus);
  
  // 사료 20% 이하 경고 시 OLED에 크고 명확하게 표시
  if (isFoodLowWarning) {
    display.fillRect(0, 42, 128, 22, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
    display.setCursor(4, 46);
    display.print("REFILL FOOD! (<=20%)");
  } else {
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 44);
    display.print("PIR: ");
    display.print(digitalRead(PIR_PIN) == HIGH ? "MOTION DETECTED" : "NO MOTION");
    
    display.setCursor(0, 54);
    display.print("SYS: NORMAL READY");
  }
  
  display.display();
}

// ==============================================================================
// 7. 급식 실행 함수 (서보모터 작동)
// ==============================================================================
void executeFeeding() {
  isFeeding = true;
  todayFeedCount++;
  
  // OLED 급식 애니메이션
  display.clearDisplay();
  display.setCursor(20, 20);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.print("FEEDING!");
  display.display();
  
  playSelectedMelody();
  
  // 서보 모터 90도 회전하여 사료 배출
  feedServo.write(90);
  delay(2000);
  feedServo.write(0);
  delay(500);
  
  isFeeding = false;
  
  // Blynk V1 상태 업데이트
  String feedStatusStr = String(todayFeedCount) + "/" + String(targetFeedCount);
  Blynk.virtualWrite(V1, feedStatusStr);
  Blynk.virtualWrite(V10, "FEEDING DONE");
  
  drawNormalScreen();
}

// ==============================================================================
// 8. 타이머 주기 검사 (매초 실행)
// ==============================================================================
void checkTimeAndScheduler() {
  // 1) 초음파 센서로 사료 잔량 측정 및 20% 경고 판별
  foodPercent = readFoodLevelPercent();
  Blynk.virtualWrite(V12, foodPercent);
  
  if (foodPercent <= 20) {
    isFoodLowWarning = true;
    Blynk.virtualWrite(V13, "WARNING: REFILL FOOD (<=20%)");
  } else {
    isFoodLowWarning = false;
    Blynk.virtualWrite(V13, "NORMAL");
  }
  
  // 2) PIR 움직임 감지 & 5분 이상 / 1시간 무반응 로직 처리
  int pirVal = digitalRead(PIR_PIN);
  Blynk.virtualWrite(V11, pirVal);
  
  if (pirVal == HIGH) {
    continuousMotionSec++;
    noMotionSec = 0; // 무반응 타이머 리셋
    
    // 5분(300초) 이상 움직임 지속 감지 -> "EATING (식사 중)"
    if (continuousMotionSec >= EATING_MOTION_THRESHOLD_SEC) {
      if (currentMealStatus != "EATING") {
        currentMealStatus = "EATING";
        Blynk.virtualWrite(V10, "EATING (5min+ Motion)");
        Serial.println("[STATUS] Pet is EATING (5min+ motion detected)");
      }
    } else {
      currentMealStatus = "WATCHING (" + String(continuousMotionSec) + "s/300s)";
      Blynk.virtualWrite(V10, currentMealStatus);
    }
  } else {
    noMotionSec++;
    continuousMotionSec = 0; // 움직임 타이머 리셋
    
    // 1시간(3600초) 동안 움직임이 전혀 없음 -> "SKIPPED (미섭취/무반응)"
    if (noMotionSec >= NO_MOTION_TIMEOUT_SEC) {
      if (currentMealStatus != "SKIPPED") {
        currentMealStatus = "SKIPPED (1hr No Motion)";
        Blynk.virtualWrite(V10, "SKIPPED (1hr No Motion)");
        Blynk.logEvent("pet_skipped", "⚠️ 경고: 반려동물이 1시간 동안 반응이 없습니다.");
        Serial.println("[STATUS] WARNING: No motion for 1 hour! Set to SKIPPED.");
      }
    }
  }
  
  if (timeStatus() == timeNotSet) return;
  
  int curHour = hour();
  int curMin = minute();
  int curSec = second();
  int curDay = day();
  int currentSecFromMidnight = curHour * 3600 + curMin * 60 + curSec;
  
  // 3) 자정(00:00:00) 자동 리셋
  if (curDay != lastResetDay) {
    if (curHour == 0 && curMin == 0 && curSec <= 2) {
      todayFeedCount = 0;
      lastResetDay = curDay;
      for (int i = 0; i < MAX_SCHEDULES; i++) {
        schedules[i].triggeredToday = false;
      }
      String feedStatusStr = String(todayFeedCount) + "/" + String(targetFeedCount);
      Blynk.virtualWrite(V1, feedStatusStr);
    }
  }
  
  // 4) OLED 화면 갱신
  if (!isFeeding) {
    drawNormalScreen();
  }
}

// ==============================================================================
// 9. Setup & Loop
// ==============================================================================
void setup() {
  Serial.begin(115200);
  
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  
  pinMode(PIR_PIN, INPUT);
  
  // 초음파 센서 핀 설정
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  feedServo.attach(SERVO_PIN);
  feedServo.write(0);
  
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println(F("[ERROR] SSD1306 Allocation Failed"));
    for (;;);
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(15, 20);
  display.print("MAMAPET READY...");
  display.display();
  
  Blynk.begin(BLYNK_AUTH_TOKEN, wifiSsid, wifiPass);
  playMelody3();
  
  timer.setInterval(1000L, checkTimeAndScheduler);
  drawNormalScreen();
}

void loop() {
  Blynk.run();
  timer.run();
}
