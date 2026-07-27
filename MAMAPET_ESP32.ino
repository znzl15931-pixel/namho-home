/*
 * ==============================================================================
 *  프로젝트명: MAMAPET - ESP32 스마트 펫 급식기 (동적 급식 스케줄 추가/삭제 기능)
 *  플랫폼: ESP32 + Blynk IoT + OLED(SSD1306) + Servo + Passive Buzzer + PIR + HC-SR04
 * ==============================================================================
 *  [📌 ESP32 회로 핀 연결 가이드 (Pinout Map)]
 * 
 *  1. OLED 디스플레이 (SSD1306 I2C 128x64)
 *     - VCC -> ESP32 3.3V, GND -> ESP32 GND
 *     - SDA -> GPIO 21, SCL -> GPIO 22
 * 
 *  2. 서보 모터 (SG90 - 급식 도어 제어)
 *     - VCC -> ESP32 5V (VIN), GND -> ESP32 GND
 *     - Signal -> GPIO 18
 * 
 *  3. 수동 부저 (Passive Buzzer)
 *     - + (신호선) -> GPIO 19, - -> ESP32 GND
 * 
 *  4. PIR 움직임 감지 센서 (HC-SR501)
 *     - VCC -> ESP32 3.3V/5V, GND -> ESP32 GND
 *     - OUT -> GPIO 27 (5분 감지: 식사 중 / 1시간 무반응: 미섭취)
 * 
 *  5. 초음파 거리 센서 (HC-SR04 - 뚜껑 사료 잔량)
 *     - VCC -> ESP32 5V, GND -> ESP32 GND
 *     - TRIG -> GPIO 5, ECHO -> GPIO 4 (20% 이하 사료 채움 경고)
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
#define TRIG_PIN      5      
#define ECHO_PIN      4      

#define MAX_SCHEDULES 6      // 최대 6차 동적 급식 스케줄 지원

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
int targetFeedCount = 3;       // 기본 3회 (사용자가 자유롭게 추가/삭제 가능)
int selectedMelody = 1;        
bool isFeeding = false;        
int lastResetDay = -1;         

// 초음파 사료 잔량 변수
int foodPercent = 100;
bool isFoodLowWarning = false;

// PIR 움직임 감지 상태 변수
int continuousMotionSec = 0;      
int noMotionSec = 0;              
String currentMealStatus = "READY"; 

// 동적 스케줄 구조체 및 배열 (기본 3차 급식 적용)
struct ScheduleSlot {
  bool enabled;
  int startSec;
  bool triggeredToday;
};

ScheduleSlot schedules[MAX_SCHEDULES] = {
  { true,  8 * 3600, false }, // 1차 08:00
  { true, 13 * 3600, false }, // 2차 13:00
  { true, 19 * 3600, false }, // 3차 19:00
  { false, -1, false },       // 비활성화 슬롯
  { false, -1, false },       
  { false, -1, false }        
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
  
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  if (duration == 0) return foodPercent; 
  
  float distanceCm = duration * 0.034 / 2.0;
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
  
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.print("MAMAPET [STATUS]");
  
  display.setCursor(95, 0);
  display.print(foodPercent);
  display.print("%");
  
  display.drawLine(0, 10, 128, 10, SSD1306_WHITE);
  
  display.setCursor(0, 16);
  display.print("FEED COUNT: ");
  display.print(todayFeedCount);
  display.print("/");
  display.print(targetFeedCount);
  
  display.setCursor(0, 28);
  display.print("MEAL: ");
  display.print(currentMealStatus);
  
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
  
  display.clearDisplay();
  display.setCursor(20, 20);
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.print("FEEDING!");
  display.display();
  
  playSelectedMelody();
  
  feedServo.write(90);
  delay(2000);
  feedServo.write(0);
  delay(500);
  
  isFeeding = false;
  
  String feedStatusStr = String(todayFeedCount) + "/" + String(targetFeedCount);
  Blynk.virtualWrite(V1, feedStatusStr);
  Blynk.virtualWrite(V10, "FEEDING DONE");
  
  drawNormalScreen();
}

// ==============================================================================
// 8. 타이머 주기 검사 (매초 실행)
// ==============================================================================
void checkTimeAndScheduler() {
  foodPercent = readFoodLevelPercent();
  Blynk.virtualWrite(V12, foodPercent);
  
  if (foodPercent <= 20) {
    isFoodLowWarning = true;
    Blynk.virtualWrite(V13, "WARNING: REFILL FOOD (<=20%)");
  } else {
    isFoodLowWarning = false;
    Blynk.virtualWrite(V13, "NORMAL");
  }
  
  int pirVal = digitalRead(PIR_PIN);
  Blynk.virtualWrite(V11, pirVal);
  
  if (pirVal == HIGH) {
    continuousMotionSec++;
    noMotionSec = 0; 
    
    if (continuousMotionSec >= EATING_MOTION_THRESHOLD_SEC) {
      if (currentMealStatus != "EATING") {
        currentMealStatus = "EATING";
        Blynk.virtualWrite(V10, "EATING (5min+ Motion)");
      }
    } else {
      currentMealStatus = "WATCHING (" + String(continuousMotionSec) + "s/300s)";
      Blynk.virtualWrite(V10, currentMealStatus);
    }
  } else {
    noMotionSec++;
    continuousMotionSec = 0; 
    
    if (noMotionSec >= NO_MOTION_TIMEOUT_SEC) {
      if (currentMealStatus != "SKIPPED") {
        currentMealStatus = "SKIPPED (1hr No Motion)";
        Blynk.virtualWrite(V10, "SKIPPED (1hr No Motion)");
        Blynk.logEvent("pet_skipped", "⚠️ 경고: 반려동물이 1시간 동안 반응이 없습니다.");
      }
    }
  }
  
  if (timeStatus() == timeNotSet) return;
  
  int curHour = hour();
  int curMin = minute();
  int curSec = second();
  int curDay = day();
  int currentSecFromMidnight = curHour * 3600 + curMin * 60 + curSec;
  
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
  
  // 동적 활성화된 스케줄 자동 실행 판별
  if (!isFeeding) {
    for (int i = 0; i < MAX_SCHEDULES; i++) {
      if (schedules[i].enabled && schedules[i].startSec >= 0) {
        if (abs(currentSecFromMidnight - schedules[i].startSec) <= 2) {
          if (!schedules[i].triggeredToday) {
            schedules[i].triggeredToday = true;
            executeFeeding();
            break;
          }
        } else if (currentSecFromMidnight > schedules[i].startSec + 10) {
          schedules[i].triggeredToday = false;
        }
      }
    }
  }
  
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
