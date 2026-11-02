# 訪查員身分不一致檢核（類似高廷峯）

- 匯出時間（台北）：2026/11/2 16:02:02
- 訪查員總數：503
- 註冊列總數：230
- 不一致筆數：73

## 判定規則
1. `visitor_id` 含 `-CIV-`／`-SOC-`
2. 名冊 `volunteer_group`
3. 註冊 profile `workerGroup`／單位／職稱（若有）
4. 文字提示：服務區／科室／職稱含「志工／紳士／社政」或「民政課／公所人員」等

## 統計

- 編碼social≠名冊組別civil：41
- 註冊civil≠編碼social：40
- 註冊social≠編碼civil：30
- 註冊social≠名冊組別civil：28
- 編碼civil≠名冊組別social：4
- 文字像社政但編碼CIV：4
- 註冊civil≠名冊組別social：1
- 文字像社政/志工但名冊是民政：1
- 文字像民政但名冊是社政：1
- 文字像民政但編碼SOC：1

## A. 建議應為社政、但名冊目前是民政（高廷峯類型，優先處理）

| 姓名 | visitor_id | 名冊組別 | 職稱 | 科室 | 服務區 | 註冊workerGroup | 註冊單位 | 註冊職稱 | 旗標 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 石雅娟 | EV-115-YH-SOC-0137 | civil_affairs |  |  | 永和區公所社會人文課 | social_affairs | 永和區公所社會人文課 | 公所人員 | 編碼social≠名冊組別civil；註冊social≠名冊組別civil |
| 何美玲 | EV-115-YH-CIV-0144 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 吳季渝 | EV-115-YH-CIV-0148 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 永和紳士協會 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 吳美燁 | EV-115-YH-CIV-0026 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 吳家隆 | EV-115-YH-CIV-0164 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 鄰長 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 呂束枝 | EV-115-YH-CIV-0031 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 李恒祥 | EV-115-YH-CIV-024589 | civil_affairs | 公所人員 | 民政課 | 永和區公所 | social_affairs | 永和區公所民政課 | 其他 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 李詹月梅 | EV-115-YH-CIV-0162 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和區保平里辦公處 | social_affairs | 永和區公所永和區保平里辦公處 | 鄰長 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 杜文玲 | EV-115-YH-CIV-0018 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 周慧敏 | EV-115-YH-CIV-637489 | civil_affairs | 公所人員 | 民政課 | 永和區公所 | social_affairs | 永和區公所民政課 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 屈樂群 | EV-115-YH-CIV-0014 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 林均秀 | EV-115-YH-CIV-0141 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 里幹事 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 林專色 | EV-115-YH-CIV-0167 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 鄰長 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 林惠美 | EV-115-YH-SOC-0142 | civil_affairs | 公所人員 | 志工 | 永和區公所社會人文課 | social_affairs | 永和區公所社會人文課 | 公所人員 | 編碼social≠名冊組別civil；註冊social≠名冊組別civil；文字像社政/志工但名冊是民政 |
| 柯汶秀 | EV-115-YH-CIV-0151 | civil_affairs | 公所人員 | 民政課 | 永和區公所社團法人中華和煦社會福利協會 | social_affairs | 永和區公所社團法人中華和煦社會福利協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 張均如 | EV-115-YH-CIV-895493 | civil_affairs | 公所人員 | 民政課 | 永和區公所 | social_affairs | 永和區公所社政 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 連淑華 | EV-115-YH-CIV-BEA165 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 陳彤槿 | EV-115-YH-CIV-0016 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 陳宥儒 | EV-115-YH-CIV-9B1E44 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 湯世香 | EV-115-YH-CIV-0027 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 黃正昌 | EV-115-YH-CIV-0147 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 黃筱崴 | EV-115-YH-CIV-5B1BF3 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 學生 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 黃瓊儀 | EV-115-YH-CIV-0019 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 楊清蘭 | EV-115-YH-CIV-0021 | civil_affairs | 公所人員 | 民政課 | 永和區公所財團法人中華長照協會 | social_affairs | 永和區公所財團法人中華長照協會 | 社工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 劉祐齊 | EV-115-YH-CIV-0020 | civil_affairs | 公所人員 | 民政課 | 永和區公所永和紳士協會 | social_affairs | 永和區公所永和紳士協會 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 蔡雅華 | EV-115-YH-CIV-0169 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 鄰長 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 鄭仁德 | EV-115-YH-CIV-486983 | civil_affairs | 公所人員 | 民政課 | 永和區公所 | social_affairs | 永和區公所民政課 | 其他 | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 賴清俊 | EV-115-YH-CIV-0015 | civil_affairs | 公所人員 | 民政課 | 永和區公所民政課 | social_affairs | 永和區公所民政課 | 志工 | 註冊social≠名冊組別civil；註冊social≠編碼civil |

## B. 建議應為民政、但名冊目前是社政

| 姓名 | visitor_id | 名冊組別 | 職稱 | 科室 | 服務區 | 註冊workerGroup | 註冊單位 | 註冊職稱 | 旗標 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 戈東生 | EV-115-YH-SOC-A510F0B5 | social_affairs | 志工 | 志工 |  | civil_affairs | 永和區公所社會人文課 | 公所人員 | 註冊civil≠名冊組別social；註冊civil≠編碼social |

## C. 全部不一致明細

| 姓名 | visitor_id | 名冊組別 | 職稱/科室 | 註冊workerGroup | 建議 | 旗標 |
| --- | --- | --- | --- | --- | --- | --- |
| 丁君如 | EV-115-YH-SOC-0163 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 戈東生 | EV-115-YH-SOC-A510F0B5 | social_affairs | 志工/志工 | civil_affairs | civil | 註冊civil≠名冊組別social；註冊civil≠編碼social |
| 王見明 | EV-115-YH-CIV-0140 | social_affairs | 志工/志工 | social_affairs | social | 編碼civil≠名冊組別social；註冊social≠編碼civil；文字像社政但編碼CIV |
| 王毓君 | EV-115-YH-SOC-0023 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 石雅娟 | EV-115-YH-SOC-0137 | civil_affairs | / | social_affairs | social | 編碼social≠名冊組別civil；註冊social≠名冊組別civil |
| 何美玲 | EV-115-YH-CIV-0144 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 何慧君 | EV-115-YH-SOC-0045 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 吳季渝 | EV-115-YH-CIV-0148 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 吳美燁 | EV-115-YH-CIV-0026 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 吳家隆 | EV-115-YH-CIV-0164 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 呂束枝 | EV-115-YH-CIV-0031 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 呂芳玲 | EV-115-YH-SOC-0026 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 李佳倩 | EV-115-YH-SOC-0029 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 李宜珍 | EV-115-YH-SOC-0021 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 李恒祥 | EV-115-YH-CIV-024589 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 李詹月梅 | EV-115-YH-CIV-0162 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 杜文玲 | EV-115-YH-CIV-0018 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 周慧敏 | EV-115-YH-CIV-637489 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 屈樂群 | EV-115-YH-CIV-0014 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 林玉貞 | EV-115-YH-SOC-0040 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 林百齡 | EV-115-YH-CIV-0145 | social_affairs | 志工/志工 | social_affairs | social | 編碼civil≠名冊組別social；註冊social≠編碼civil；文字像社政但編碼CIV |
| 林均秀 | EV-115-YH-CIV-0141 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 林芬玉 | EV-115-YH-SOC-927601 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 林芬玉 | EV-115-YH-SOC-184816 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 林專色 | EV-115-YH-CIV-0167 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 林惠美 | EV-115-YH-SOC-0142 | civil_affairs | 公所人員/志工 | social_affairs | social | 編碼social≠名冊組別civil；註冊social≠名冊組別civil；文字像社政/志工但名冊是民政 |
| 邱淑雲 | EV-115-YH-SOC-0052 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 柯汶秀 | EV-115-YH-CIV-0151 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 洪怡萍 | EV-115-YH-SOC-0019 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 徐秋潤 | EV-115-YH-SOC-0013 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 高廷峯 | EV-115-YH-CIV-0033 | social_affairs | 志工/志工 | social_affairs | social | 編碼civil≠名冊組別social；註冊social≠編碼civil；文字像社政但編碼CIV |
| 張均如 | EV-115-YH-CIV-895493 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 張芸綾 | EV-115-YH-SOC-0034 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 張恒璉 | EV-115-YH-SOC-0047 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 張毓秦 | EV-115-YH-SOC-0131 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 張馨云 | EV-115-YH-SOC-933645 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 莊英梅 | EV-115-YH-SOC-0132 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 連淑華 | EV-115-YH-CIV-BEA165 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 連惠玉 | EV-115-YH-SOC-0042 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 郭品妊 | EV-115-YH-CIV-0149 | social_affairs | 志工/志工 | social_affairs | social | 編碼civil≠名冊組別social；註冊social≠編碼civil；文字像社政但編碼CIV |
| 郭建麟 | EV-115-YH-SOC-0012 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 郭益美 | EV-115-YH-SOC-0024 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 陳彤槿 | EV-115-YH-CIV-0016 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 陳沛岑 | EV-115-YH-SOC-0048 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 陳秀美 | EV-115-YH-SOC-364988 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 陳宥儒 | EV-115-YH-CIV-9B1E44 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 陳淑卿 | EV-115-YH-SOC-0039 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 陳雅玲 | EV-115-YH-SOC-0036 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 温雅鈴 | EV-115-YH-SOC-0044 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 湯世香 | EV-115-YH-SOC-0152 | social_affairs | / | social_affairs | social | 文字像民政但名冊是社政；文字像民政但編碼SOC |
| 湯世香 | EV-115-YH-CIV-0027 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 黃正昌 | EV-115-YH-CIV-0147 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 黃淑美 | EV-115-YH-SOC-0149 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 黃筱崴 | EV-115-YH-CIV-5B1BF3 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 黃瓊儀 | EV-115-YH-CIV-0019 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 楊清蘭 | EV-115-YH-CIV-0021 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 廖美芳 | EV-115-YH-SOC-0050 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 趙瑋萍 | EV-115-YH-SOC-0049 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 劉兆娟 | EV-115-YH-SOC-0133 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 劉祐齊 | EV-115-YH-CIV-0020 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 劉興祥 | EV-115-YH-SOC-0017 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 蔡明達 | EV-115-YH-SOC-0033 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 蔡惠珠 | EV-115-YH-SOC-0020 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 蔡雅華 | EV-115-YH-CIV-0169 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 蔡麗婷 | EV-115-YH-SOC-0139 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 鄭仁德 | EV-115-YH-CIV-486983 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 賴清俊 | EV-115-YH-CIV-0015 | civil_affairs | 公所人員/民政課 | social_affairs | social | 註冊social≠名冊組別civil；註冊social≠編碼civil |
| 謝沛璇 | EV-115-YH-SOC-0035 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 謝佳敏 | EV-115-YH-SOC-0032 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 鍾慧君 | EV-115-YH-SOC-0164 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 藍淑芬 | EV-115-YH-SOC-0134 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 顏麗蘋 | EV-115-YH-SOC-0031 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |
| 蘇雪芬 | EV-115-YH-SOC-0043 | civil_affairs | / | civil_affairs | civil | 編碼social≠名冊組別civil；註冊civil≠編碼social |

## D. 同名多筆（可能重複建檔）

同名且編碼／組別／證號有差異：6 組

### 張馨云
- EV-115-YH-SOC-933645｜civil_affairs｜/｜0931051291｜A228592022｜已核准
- EV-115-YH-SOC-0001｜social_affairs｜志工/志工｜0931051291｜A228592022｜已核准

### 陳秀珠
- EV-115-YH-SOC-0159｜social_affairs｜/｜0937011331｜T220340817｜已核准
- EV-115-YH-SOC-5C2648B8｜social_affairs｜志工/志工｜922007200｜G221002576｜已核准

### 湯世香
- EV-115-YH-SOC-0152｜social_affairs｜/｜0920697735｜K220474099｜已核准
- EV-115-YH-CIV-0029｜civil_affairs｜/｜0920697735｜K220474099｜已核准
- EV-115-YH-CIV-0027｜civil_affairs｜公所人員/民政課｜0920697735｜K220474099｜已核准

### 呂淑慧
- EV-115-YH-SOC-0146｜social_affairs｜/｜0920839577｜H220657738｜已核准
- EV-115-YH-SOC-C05B7B94｜social_affairs｜志工/志工｜918222690｜Q221342107｜已核准

### 陳美玲
- EV-115-YH-SOC-0140｜social_affairs｜/｜0952503679｜.E220202963｜已核准
- EV-115-YH-SOC-8EFFE5DA｜social_affairs｜志工/志工｜970012950｜Y220160376｜已核准

### 張均如
- EV-115-YH-CIV-895493｜civil_affairs｜公所人員/民政課｜900610081｜F225234840｜已核准
- V-YH-243333｜social_affairs｜/｜900610810｜F225234840｜已核准
