# 📋 스마트홈 웹 대시보드 표준 제품 요구사항 정의서 (PRD_s)

### ESP32 Bluetooth NUS Web Controller — 학생용 표준 템플릿

---

> [!IMPORTANT]
> **이 문서의 사용 방법**
>
> 이 PRD_s 파일을 **Antigravity(안티그래비티)**에 제공하면, AI가 이 문서를 읽고 여러분만의 스마트홈 웹 대시보드를 처음부터 자동으로 만들어 줍니다.
>
> **시작 전에 아래 항목들을 본인의 정보로 채워주세요:**
>
> - `[내 이름]` → 본인 이름 또는 프로젝트명 (예: "김민준 스마트홈")
> - `[내 기기명]` → ESP32 블루투스 기기 이름 (예: `ESP_student01`)
> - `[내 캐릭터]` → OLED에 출력할 이미지 파일명 (예: `pikachu.pbm`)
>
> **Antigravity에 이 파일을 주면서 이렇게 요청하세요:**
>
>> "PRD_s 파일을 참고해서 나만의 스마트홈 웹 대시보드를 만들어줘"
>>

---

## 📌 0. 프로젝트 기본 정보 (학생이 채워주세요)

| 항목                     | 내용                                         |
| :----------------------- | :------------------------------------------- |
| **프로젝트명**     | `[yellow]`의 스마트홈 대시보드             |
| **제작자**         | `[ryun]`                                   |
| **BLE 기기명**     | `ESP_s` (예: `ESP_student01`)            |
| **OLED 이미지**    | `img/snoppy.pbm` (예: `img/pikachu.pbm`) |
| **메인 컬러 테마** | 노란색계열                                   |

---

## 🔩 1. 하드웨어 시스템 사양 (Hardware Specifications)

ESP32 DEVKIT V1(30핀) 마이크로컨트롤러를 기반으로 각 센서/액추에이터를 연결합니다.

### 1.1. 표준 핀 결선 맵 (Pin Mapping)

| 하드웨어                 | 모델                  | ESP32 GPIO 핀 | 입출력          |
| :----------------------- | :-------------------- | :------------ | :-------------- |
| **터치 센서 1번**  | TTP223                | D17           | 디지털 입력     |
| **터치 센서 2번**  | TTP223                | D5            | 디지털 입력     |
| **터치 센서 3번**  | TTP223                | D18           | 디지털 입력     |
| **터치 센서 4번**  | TTP223                | D19           | 디지털 입력     |
| **RGB LED (빨강)** | 공통 캐소드 RGB       | D25           | 디지털 출력     |
| **RGB LED (초록)** | 공통 캐소드 RGB       | D26           | 디지털 출력     |
| **RGB LED (파랑)** | 공통 캐소드 RGB       | D27           | 디지털 출력     |
| **조도 센서**      | CdS 광도전 셀         | D36 (ADC)     | 아날로그 입력   |
| **서보 모터**      | SG90                  | D13           | PWM 출력        |
| **온습도 센서**    | DHT11                 | D14           | 1-Wire 디지털   |
| **피에조 부저**    | 패시브 부저           | D23           | PWM 주파수 출력 |
| **LCD (SDA)**      | HD44780 I2C (0x27)    | D21           | I2C             |
| **LCD (SCL)**      | HD44780 I2C (0x27)    | D22           | I2C             |
| **OLED (SDA)**     | SSD1306 128x64 (0x3C) | D21           | I2C             |
| **OLED (SCL)**     | SSD1306 128x64 (0x3C) | D22           | I2C             |

---

## 📡 2. 블루투스 BLE NUS 통신 규격 (BLE Specification)

웹 앱과 ESP32는 **Nordic UART Service (NUS)** 프로토콜로 양방향 통신합니다.

### 2.1. NUS UUID 규격

| 채널                  | UUID                                     | 방향        |
| :-------------------- | :--------------------------------------- | :---------- |
| **NUS 서비스**  | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` | —          |
| **RX (Write)**  | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` | 웹 → ESP32 |
| **TX (Notify)** | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` | ESP32 → 웹 |

### 2.2. ESP32 펌웨어 기기명 설정 (`smartHome.py`)

```python
# ble_library 초기화 시 기기명을 'ESP_'로 시작하도록 설정 (필수!)
ble = bluetooth.BLE()
p = ble_library.BLESimplePeripheral(ble, "ESP_[내 기기명]")
# 예: p = ble_library.BLESimplePeripheral(ble, "ESP_student01")
```

### 2.3. 웹 블루투스 스캔 방식 (JavaScript)

```javascript
// NUS 서비스 UUID + namePrefix 'ESP_' AND 조건 결합
// → 'ESP_'로 시작하는 이름의 NUS 기기만 스캔 목록에 표시
// → iOS(Bluefy) / Android(Chrome) / PC 모두 정상 동작
navigator.bluetooth.requestDevice({
    filters: [{
        services: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'],
        namePrefix: 'ESP_'
    }]
});
```

> [!NOTE]
> **iOS 아이폰 사용자**: Safari는 Web Bluetooth를 지원하지 않습니다. **App Store에서 Bluefy 앱(무료)**을 설치하고 그 안에서 이 웹사이트 주소를 입력해야 합니다.

### 2.4. 모바일 지원 브라우저

| 플랫폼          | 사용 브라우저                          |
| :-------------- | :------------------------------------- |
| 🤖 Android      | Chrome (근처 기기 권한 허용)           |
| 🍏 iPhone (iOS) | **Bluefy** (App Store 무료 설치) |
| 💻 PC / Mac     | Chrome 또는 Edge                       |

---

## 🎮 3. 제어 명령어 패킷 규격 (Control Command Spec)

### 3.1. 웹 → ESP32 단방향 제어 명령어 (ASCII 1글자)

| 제어 문자 | 연결된 기능       | ESP32 동작                                |
| :-------: | :---------------- | :---------------------------------------- |
|  `'1'`  | 온습도 조회       | DHT11 측정 → LCD 출력 + 웹으로 값 송신   |
|  `'2'`  | 조도 조회         | CdS ADC 측정 → LCD 출력 + 웹으로 값 송신 |
|  `'3'`  | LCD 백라이트 켜기 | `lcd.backlight_on()`                    |
|  `'4'`  | LCD 백라이트 끄기 | `lcd.backlight_off()`                   |
|  `'5'`  | 멜로디 1 재생     | 부저: 학교종이 땡땡땡 주파수 출력         |
|  `'6'`  | 멜로디 2 재생     | 부저: 반짝반짝 작은별 주파수 출력         |
|  `'7'`  | 전등 켜기         | RGB LED 전체 HIGH → 점등                 |
|  `'8'`  | 전등 끄기         | RGB LED 전체 LOW → 소등                  |
|  `'9'`  | OLED 이미지 출력  | `img/[내 캐릭터].pbm` 비트맵 드로잉     |

> [!TIP]
> 버튼을 추가하고 싶다면 `'a'`, `'b'`, `'c'`... 형태로 명령어를 확장하고, `smartHome.py`의 `on_rx(v)` 함수에 해당 분기(`if v == 'a': ...`)를 추가하면 됩니다.

### 3.2. ESP32 → 웹 센서 피드백 패킷 형식

각 메시지 끝에 반드시 `\n` 줄바꿈 구분자를 붙입니다.

```python
# 온습도 조회 ('1' 수신 시)
p.send("temp : " + str(temp) + "\n")   # 예: "temp : 24\n"
p.send("humi : " + str(humi) + "\n")   # 예: "humi : 45\n"

# 조도 조회 ('2' 수신 시)
p.send(str(cds_value) + "\n")           # 예: "320\n"
```

웹 측 JavaScript 파싱 방법:

```javascript
if (msg.includes('temp')) { /* 온도 파싱 */ }
if (msg.includes('humi')) { /* 습도 파싱 */ }
if (/^\d+$/.test(msg))    { /* 조도 파싱 */ }
```

---

## 🎨 4. UI/UX 디자인 가이드라인

### 4.1. 디자인 테마 (학생이 선택 가능)

아래 세 가지 테마 중 하나를 선택하거나, 원하는 색상을 직접 지정할 수 있습니다.

| 테마명                           | 배경색        | 포인트 컬러        | 분위기                 |
| :------------------------------- | :------------ | :----------------- | :--------------------- |
| **Ambient Harmony** (기본) | `#f1f5f9`   | `#2563eb` (블루) | 차분하고 고급스러운    |
| **Forest Green**           | `#f0f5f1`   | `#16a34a` (그린) | 자연친화적이고 활기찬  |
| **Sunset Amber**           | `#fdf8f0`   | `#d97706` (앰버) | 따뜻하고 에너지 넘치는 |
| **직접 지정**              | 원하는 배경색 | 원하는 포인트색    | 나만의 스타일          |

### 4.2. 네오모피즘 그림자 공식 (Neumorphic CSS)

모든 카드와 버튼에 아래 이중 광원 그림자를 적용합니다.

```css
/* Raised: 평상시 카드/버튼 (튀어나온 느낌) */
box-shadow: 6px 6px 12px [어두운 그림자색], -6px -6px 12px #ffffff;

/* Sunken: 클릭된 버튼 / 터미널 패널 (눌린 느낌) */
box-shadow: inset 4px 4px 8px [어두운 그림자색], inset -4px -4px 8px #ffffff;
```

### 4.3. 필수 UI 구성 요소

웹 페이지는 반드시 아래 구성 요소를 포함해야 합니다.

| 구성 요소                    | 설명                                                                              |
| :--------------------------- | :-------------------------------------------------------------------------------- |
| **기기 연결 오버레이** | 앱 첫 진입 시 블루투스 연결을 유도하는 전체화면 팝업 (연결 전 대시보드 블러 처리) |
| **상태 배지**          | 헤더의 연결 상태 표시 (연결 대기 / 연결됨 / 스캔 중)                              |
| **센서 모니터 카드**   | 온습도 + 조도를 실시간 표시하는 새로고침 버튼 포함 카드                           |
| **제어 버튼 패널**     | LCD, 부저, LED, OLED 등 각 기능 제어 버튼 그룹                                    |
| **통신 로그 터미널**   | TX/RX 실시간 통신 기록 모니터 (디버깅용)                                          |
| **하단 탭 바**         | 모바일 앱 스타일 하단 고정 내비게이션 메뉴                                        |

### 4.4. 반응형 앱 스타일 기준

- 최대 너비: `max-width: 480px` (모바일 스마트폰 비율 최적화)
- 폰트: `Plus Jakarta Sans` (UI) + `JetBrains Mono` (숫자/코드)
- 하단 탭 바: `backdrop-filter: blur(12px)` 글래스모피즘 효과

---

## 🚀 5. 개발 및 실행 방법

### 5.1. 필요한 파일 구성

```
나만의_스마트홈/
├── index.html        ← Antigravity가 자동으로 생성해 주는 웹 대시보드
├── smartHome.py      ← ESP32 MicroPython 펌웨어 (아래 참고)
└── img/
    └── [내캐릭터].pbm ← OLED에 출력할 흑백 128x64 비트맵 이미지
```

### 5.2. smartHome.py 핵심 구조 (MicroPython)

```python
# 1. 블루투스 기기명을 'ESP_'로 시작하도록 설정 (필수)
p = ble_library.BLESimplePeripheral(ble, "ESP_[내 기기명]")

# 2. 수신 명령어 처리 함수
def on_rx(v):
    if v == '1':  # 온습도 조회
        d.measure()
        p.send("temp : " + str(int(d.temperature())) + "\n")
        p.send("humi : " + str(int(d.humidity())) + "\n")
    if v == '2':  # 조도 조회
        p.send(str(cds.read()) + "\n")
    if v == '3': lcd.backlight_on()
    if v == '4': lcd.backlight_off()
    if v == '5': # 멜로디 1 재생
        ...
    if v == '6': # 멜로디 2 재생
        ...
    if v == '7': R.on(); G.on(); B.on()   # 전등 켜기
    if v == '8': R.off(); G.off(); B.off() # 전등 끄기
    if v == '9': # OLED 이미지 출력
        ...

p.on_write(on_rx)
```

### 5.3. 로컬에서 테스트하는 방법

```bash
# 터미널(명령 프롬프트)에서 실행
python -m http.server 8000 --directory [SmartHome 폴더 경로]

# 브라우저에서 접속
http://localhost:8000
```

> [!NOTE]
> Web Bluetooth API는 반드시 **HTTPS** 또는 **localhost** 환경에서만 동작합니다. `file://`로 직접 파일을 열면 블루투스가 작동하지 않습니다.

---

## ✏️ 6. 학생별 커스터마이징 체크리스트

Antigravity에 이 파일을 제공하기 전에 아래 항목을 직접 수정해 주세요.

- [ ] **프로젝트명** 변경: `[내 이름]`을 본인 이름으로 수정
- [ ] **BLE 기기명** 변경: `ESP_[내 기기명]`을 본인 기기명으로 수정 (예: `ESP_minsu`)
- [ ] **OLED 이미지** 변경: 원하는 PBM 파일명 지정
- [ ] **색상 테마** 선택: 위의 4가지 테마 중 하나 선택 또는 직접 색상 지정
- [ ] **추가 기능** 작성: 기본 9개 명령어 외에 추가하고 싶은 기능 자유롭게 기입

---

## 🤖 7. Antigravity에 요청하는 방법 (사용 가이드)

이 파일을 Antigravity(안티그래비티)에 드래그하거나 `@[파일명]`으로 첨부한 후, 아래 예시처럼 요청하세요.

**요청 예시:**

> "PRD_s 파일을 참고해서 나만의 스마트홈 웹 대시보드를 만들어줘. 기기명은 ESP_minsu이고 초록색 테마로 만들어줘."

**Antigravity가 자동으로 해주는 것:**

- `index.html` (웹 대시보드) 생성
- `smartHome.py` (ESP32 펌웨어) 생성
- 입력한 기기명/테마/이미지가 반영된 맞춤형 스마트홈 웹 제작
- 로컬 서버 실행 및 테스트 안내
