/*
 * ==============================================================================
 *  프로젝트명: MAMAPET - ESP32 스마트 펫 급식기 (PIR 식사 감지 기능 추가)
 *  작성자: Antigravity AI & Developer
 *  플랫폼: ESP32 + Blynk IoT + OLED(SSD1306) + Servo + Passive Buzzer + PIR Sensor
 * ==============================================================================
 *  [핀 배치 정보 (Pinout)]
 *  - OLED SSD1306 (I2C) : SDA -> GPIO 21, SCL -> GPIO 22
 *  - 서보모터 (Servo)    : PWM Signal -> GPIO 18
 *  - 수동 부저 (Buzzer)  : PWM Signal -> GPIO 19
 *  - PIR 인체/동물 감지   : Digital Input -> GPIO 27
 * 
 *  [Blynk 가상 핀 (Virtual Pins)]
 *  - V1 : 오늘의 급식 카운터 (Display / String "2/3")
 *  - V2 : 수동 원격 급식 버튼 (Push Button)
 *  - V3~V9 : 다중 급식 스케줄러 & 멜로디 & 목표 횟수 설정
 *  - V10: 식사 완료 상태 (Display / String: "ATE", "SKIPPED", "WATCHING...")
 *  - V11: PIR 움직임 실시간 감지 상태 (LED Widget / Integer: 0 or 1)
 * ==============================================================================
 */

// 1. Blynk 설정
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

// 2. 하드웨어 핀 및 상수 정의
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
#define OLED_ADDRESS  0x3C

#define SERVO_PIN     18
#define BUZZER_PIN    19
#define PIR_PIN       27     // PIR 움직임 감지 센서 핀
#define MAX_SCHEDULES 4      // 최대 4차 급식 스케줄 지원

#define MEAL_TIMEOUT_MS  (30 * 60 * 1000L) // 식사 감지 대기 시간 (30분)
#define REQUIRED_MOTION_SEC 15             // 식사 판단 필요 누적 움직임 시간 (15초)

// 3. 글로벌 객체 생성
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
Servo feedServo;
BlynkTimer timer;
WidgetRTC rtc;

// 4. 시스템 상태 변수
char wifiSsid[] = "Your_WiFi_SSID";
char wifiPass[] = "Your_WiFi_Password";

int todayFeedCount = 0;        // 오늘 급식한 횟수
int targetFeedCount = 3;       // 하루 목표 급식 횟수
int selectedMelody = 1;        // 1: Happy, 2: Gentle, 3: Short Beep
bool isFeeding = false;        // 급식 중 플래그
int lastResetDay = -1;         // 자정 리셋 판별용 변수

// PIR 식사 감지 상태 변수
bool isMealTracking = false;               // 사료 배출 후 30분 식사 감지 모드 여부
unsigned long mealTrackingStartMs = 0;      // 식사 감지 시작 시각 (millis)
int motionAccumulatorSec = 0;              // 감지된 누적 움직임 초 (목표 15초)
String lastMealStatus = "READY";           // "ATE" (식사완료), "SKIPPED" (미섭취), "WATCHING", "READY"

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

// 5. 음표 주파수 정의
#define NOTE_C4  262
#define NOTE_E4  330
#define NOTE_G4  392
#define NOTE_A4  440
#define NOTE_B4  494
#define NOTE_C5  523
#define NOTE_E5  659
#define NOTE_G5  784

// ==============================================================================
// 부저 멜로디 재생 함수들
// ==============================================================================
void playMelody1() {
  int melody[] = { NOTE_C4, NOTE_E4, NOTE_G4, NOTE_C5, NOTE_E5, NOTE_G5 };
  int durations[] = { 100, 100, 100, 120, 120, 250 };
  for (int i = 0; i < 6; i++) {
    tone(BUZZER_PIN, melody[i], durations[i]);
    delay(durations[i] * 1.2);
  }
  noTone(BUZZER_PIN);
}

void playMelody2() {
  int melody[] = { NOTE_E4, NOTE_G4, NOTE_B4, NOTE_E5 };
  int durations[] = { 150, 150, 150, 300 };
  for (int i = 0; i < 4; i++) {
    tone(BUZZER_PIN, melody[i], durations[i]);
    delay(durations[i] * 1.3);
  }
  noTone(BUZZER_PIN);
}

void playMelody3() {
  tone(BUZZER_PIN, NOTE_A4, 120);
  delay(150);
  tone(BUZZER_PIN, NOTE_C5, 200);
  delay(220);
  noTone(BUZZER_PIN);
}

void playSelectedMelody() {
  switch (selectedMelody) {
    case 1: playMelody1(); break;
    case 2: playMelody2(); break;
    case 3: playMelody3(); break;
    default: playMelody1(); break;
  }
}

// ==============================================================================
// OLED 화면 렌더링 함수들
// ==============================================================================
int getNextScheduleSec() {
  if (timeStatus() == timeNotSet) return -1;
  int currentSec = hour() * 3600 + minute() * 60 + second();
  int minDiff = 86400 * 2;
  int nextSec = -1;

  for (int i = 0; i < targetFeedCount && i < MAX_SCHEDULES; i++) {
    if (schedules[i].enabled && schedules[i].startSec >= 0) {
      int diff = schedules[i].startSec - currentSec;
      if (diff > 0 && diff < minDiff) {
        minDiff = diff;
        nextSec = schedules[i].startSec;
      }
    }
  }

  if (nextSec < 0) {
    for (int i = 0; i < targetFeedCount && i < MAX_SCHEDULES; i++) {
      if (schedules[i].enabled && schedules[i].startSec >= 0) {
        return schedules[i].startSec;
      }
    }
  }
  return nextSec;
}

void drawNormalScreen() {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  
  // 1) 상단: 급식 카운터 & 실시간 시각
  display.setTextSize(1);
  display.setCursor(0, 2);
  display.printf("FED: [%d/%d]", todayFeedCount, targetFeedCount);
  
  display.setCursor(72, 2);
  if (timeStatus() != timeNotSet) {
    display.printf("%02d:%02d:%02d", hour(), minute(), second());
  } else {
    display.print("SYNCING");
  }
  
  display.drawFastHLine(0, 13, 128, SSD1306_WHITE);
  
  // 2) 중앙: 식사 감지 상태 (PIR 센서 결과) 및 기기 상태
  display.setCursor(0, 18);
  display.print("MAMAPET SMART FEEDER");
  
  display.setCursor(0, 30);
  display.print("MEAL : ");
  if (isMealTracking) {
    display.printf("WATCHING (%ds/15s)", motionAccumulatorSec);
  } else if (lastMealStatus == "ATE") {
    display.print("ATE (COMPLETED) [O]");
  } else if (lastMealStatus == "SKIPPED") {
    display.print("SKIPPED (ALERT) [X]");
  } else {
    display.print("READY");
  }
  
  display.setCursor(0, 42);
  display.print("PIR  : ");
  if (digitalRead(PIR_PIN) == HIGH) {
    display.print("MOTION DETECTED!");
  } else {
    display.print("NO MOTION");
  }
  
  display.drawFastHLine(0, 52, 128, SSD1306_WHITE);
  
  // 3) 하단: 다음 지정 급식 시각 표시
  display.setCursor(0, 55);
  int nextSec = getNextScheduleSec();
  if (nextSec >= 0) {
    int nHour = nextSec / 3600;
    int nMin = (nextSec % 3600) / 60;
    display.printf("NEXT: %02d:%02d (SCHED)", nHour, nMin);
  } else {
    display.print("NEXT: MANUAL ONLY");
  }
  
  display.display();
}

void drawFeedingScreen(int animFrame) {
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  
  display.setTextSize(1);
  display.setCursor(20, 2);
  display.print("*** FEEDING ***");
  display.drawFastHLine(0, 12, 128, SSD1306_WHITE);
  
  display.drawRect(44, 38, 40, 16, SSD1306_WHITE);
  display.fillRect(40, 34, 48, 4, SSD1306_WHITE);
  
  int offset = (animFrame % 3) * 5;
  display.fillCircle(64, 18 + offset, 2, SSD1306_WHITE);
  display.fillCircle(58, 22 + offset, 2, SSD1306_WHITE);
  display.fillCircle(70, 20 + offset, 2, SSD1306_WHITE);
  
  int foodLevel = (animFrame % 4) * 3;
  display.fillRect(46, 52 - foodLevel, 36, foodLevel, SSD1306_WHITE);
  
  display.setCursor(24, 55);
  display.print("DISPENSING...");
  
  display.display();
}

// ==============================================================================
// 급식 실행 및 PIR 식사 감지 모드 시작
// ==============================================================================
void executeFeeding() {
  if (isFeeding) return;
  isFeeding = true;
  
  Serial.println("[MAMAPET] Feeding Triggered!");
  Blynk.virtualWrite(V6, "FEEDING IN PROGRESS...");
  
  for (int f = 0; f < 8; f++) {
    drawFeedingScreen(f);
    if (f == 1) feedServo.write(90);      // 서보모터 열기
    else if (f == 4) playSelectedMelody(); // 멜로디 재생
    else if (f == 6) feedServo.write(0);  // 서보모터 닫기
    delay(250);
  }
  
  feedServo.write(0);
  todayFeedCount++;
  
  // Blynk V1 및 상태 업데이트
  String feedStatusStr = String(todayFeedCount) + "/" + String(targetFeedCount);
  Blynk.virtualWrite(V1, feedStatusStr);
  Blynk.virtualWrite(V6, "FEEDING COMPLETED!");
  
  // -------------------------------------------------------------
  // 🔥 [PIR 식사 감지 모드 30분 시작]
  // -------------------------------------------------------------
  isMealTracking = true;
  mealTrackingStartMs = millis();
  motionAccumulatorSec = 0;
  lastMealStatus = "WATCHING";
  
  Blynk.virtualWrite(V10, "WATCHING (0s/15s)");
  Serial.println("[PIR Tracker] 30-Minute Meal Detection Mode Started!");
  
  isFeeding = false;
  drawNormalScreen();
}

// ==============================================================================
// Blynk 가상 핀 Event 핸들러 (Blynk Callbacks)
// ==============================================================================
BLYNK_CONNECTED() {
  Serial.println("[Blynk] Connected to Cloud!");
  rtc.begin();
  Blynk.sendInternal("rtc", "sync");
  
  Blynk.syncVirtual(V2, V3, V4, V5, V7, V8, V9);
  
  String feedStatusStr = String(todayFeedCount) + "/" + String(targetFeedCount);
  Blynk.virtualWrite(V1, feedStatusStr);
  Blynk.virtualWrite(V10, "READY");
  Blynk.virtualWrite(V6, "SYSTEM READY");
}

BLYNK_WRITE(V2) {
  if (param.asInt() == 1 && !isFeeding) {
    executeFeeding();
  }
}

void parseSchedulePin(int index, BlynkParam param) {
  TimeInputParam t(param);
  if (t.hasStartTime()) {
    schedules[index].enabled = true;
    schedules[index].startSec = t.getStartSec();
  } else {
    schedules[index].enabled = false;
  }
  drawNormalScreen();
}

BLYNK_WRITE(V3) { parseSchedulePin(0, param); }
BLYNK_WRITE(V7) { parseSchedulePin(1, param); }
BLYNK_WRITE(V8) { parseSchedulePin(2, param); }
BLYNK_WRITE(V9) { parseSchedulePin(3, param); }

BLYNK_WRITE(V4) {
  selectedMelody = param.asInt();
  if (selectedMelody < 1 || selectedMelody > 3) selectedMelody = 1;
  drawNormalScreen();
}

BLYNK_WRITE(V5) {
  targetFeedCount = param.asInt();
  if (targetFeedCount < 1) targetFeedCount = 1;
  if (targetFeedCount > MAX_SCHEDULES) targetFeedCount = MAX_SCHEDULES;
  
  String feedStatusStr = String(todayFeedCount) + "/" + String(targetFeedCount);
  Blynk.virtualWrite(V1, feedStatusStr);
  drawNormalScreen();
}

// ==============================================================================
// 타이머 주기 검사 & PIR 식사 추적 로직 (매초 실행)
// ==============================================================================
void checkTimeAndScheduler() {
  // 1) PIR 움직임 감지 상태 실시간 검사 & Blynk V11 업데이트
  int pirVal = digitalRead(PIR_PIN);
  Blynk.virtualWrite(V11, pirVal);
  
  // 2) PIR 식사 감지 모드 동작 중일 때 (30분 이내)
  if (isMealTracking) {
    unsigned long elapsed = millis() - mealTrackingStartMs;
    
    // 움직임 감지 시 초 단위 누적 증가
    if (pirVal == HIGH) {
      motionAccumulatorSec++;
      Serial.printf("[PIR Tracker] Motion Detected! Accumulator: %d/%d sec\n", motionAccumulatorSec, REQUIRED_MOTION_SEC);
      
      String statusStr = "WATCHING (" + String(motionAccumulatorSec) + "s/15s)";
      Blynk.virtualWrite(V10, statusStr);
    }
    
    // A) 15초 이상 누적 감지 성공 -> 식사 완료 (ATE)
    if (motionAccumulatorSec >= REQUIRED_MOTION_SEC) {
      isMealTracking = false;
      lastMealStatus = "ATE";
      
      Blynk.virtualWrite(V10, "ATE (COMPLETED)");
      Blynk.virtualWrite(V6, "MEAL COMPLETED (ATE)");
      Serial.println("[PIR Tracker] SUCCESS: Pet Ate Meal! (ATE)");
      
      // 기분 좋은 축하 알림음 재생
      playMelody1();
    }
    // B) 30분(MEAL_TIMEOUT_MS) 초과할 때까지 15초 미만 감지 -> 미섭취 (SKIPPED)
    else if (elapsed >= MEAL_TIMEOUT_MS) {
      isMealTracking = false;
      lastMealStatus = "SKIPPED";
      
      Blynk.virtualWrite(V10, "SKIPPED (ALERT)");
      Blynk.virtualWrite(V6, "WARNING: MEAL SKIPPED!");
      Serial.println("[PIR Tracker] WARNING: Pet Skipped Meal (30m No Motion)!");
      
      // Blynk 푸시 알림 전송 (Blynk Console Event 설정 필요)
      Blynk.logEvent("pet_skipped", "⚠️ 경고: 반려동물이 급식 후 30분간 사료를 먹지 않았습니다!");
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
      Blynk.virtualWrite(V6, "MIDNIGHT RESET COMPLETED");
    }
  }
  
  // 4) 스케줄 자동 급식 실행 판별
  if (!isFeeding) {
    for (int i = 0; i < targetFeedCount && i < MAX_SCHEDULES; i++) {
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
  
  // 5) OLED 화면 주기적 갱신
  if (!isFeeding) {
    drawNormalScreen();
  }
}

// ==============================================================================
// 초기화 및 메인 루프 (Setup & Loop)
// ==============================================================================
void setup() {
  Serial.begin(115200);
  
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  
  pinMode(PIR_PIN, INPUT); // PIR 센서 핀 입력 설정
  
  feedServo.attach(SERVO_PIN);
  feedServo.write(0);
  
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS)) {
    Serial.println(F("[ERROR] SSD1306 Allocation Failed"));
    for (;;);
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(20, 20);
  display.print("MAMAPET STARTING...");
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
