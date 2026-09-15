# 新北紙本 A3 套印格 ↔ 衛福部 102 欄對照

> 套版來源：Google Spreadsheet `106h8JIuZ4CdCUqXn5vImoxRbveTknylzsiy4lMpAnPk`，工作表 `獨居長者生活關懷表`。  
> 102 欄來源：`lib/domain/mohw-life-care-schema.json`。  
> 列印：GAS 複製母版後直接填寫下列對應儲存格，再以 `scale=4` 輸出單頁直式 A3。

紙本約 72 個題組；102 是拆欄後的匯入格式。列印對紙本格子，xlsx 對 102 欄。

## 頁面假設

| 區塊 | 內容 |
|------|------|
| 頁首 | 職章／訪查時間／區域年度月份 |
| 上半 | 一、獨居老人資料 → 問卷（住宅～煩惱） |
| 下半 | 問卷（求助～服務）→ 二、觀察題 → 三、特殊題項 |
| 不印 | 90–102 個資同意、社政／民政訪查人 |

## 對照表

| 紙本區塊 | 紙本格子 | 102 欄 | key | 套印 | 拆欄說明 |
|----------|----------|--------|-----|------|----------|
| 頁首 | 年度／月份／區域／五碼 | — | `overlay_year` 等（衍生） | 是 | 非 102 欄，由訪查日期與案號帶入 |
| 頁首 | 訪查時間 | 1–3 | `visit_date`, `visit_start_time`, `visit_end_time` | 是 | 紙本一格，102 拆日期與起迄 |
| 頁首 | 拒絕訪查／訪視狀態 | 4 | `visit_status` | 是 | 紙本勾選 ↔ 已完成／拒絕訪視／查無此人 |
| 頁首 | 備註 | 5 | `visit_notes` | 選印 | |
| 頁首 | 訪查／核對簽名、單號 | — | — | 否 | 人工核對，不逼手機填 |
| 一、資料 | 姓名 | 6 | `name` | 是 | |
| 一、資料 | 性別 | 7 | `gender` | 是 | |
| 一、資料 | 出生年月日 | 8 | `birth_date` | 是 | |
| 一、資料 | 身分證字號 | 9 | `national_id` | 是 | |
| 一、資料 | 電話／手機 | 10–11 | `phone`, `mobile` | 是 | |
| 一、資料 | Line | 12–13 | `line_id_status`, `line_id` | 是 | 紙本常合併；102 拆狀態與帳號 |
| 一、資料 | 緊急聯絡人 | 14–17 | `emergency_contact_*` | 是 | 紙本一欄，102 拆姓名／關係／其他／電話 |
| 一、資料 | 戶籍地址 | 18–21 | `household_*` | 是 | 紙本一套格子，102 拆縣市村里地址 |
| 一、資料 | 居住地址類型與現址 | 22–28 | `living_address_*` | 是 | 含與戶籍相同／未住／查無此人 |
| 問卷 | 住宅類型 | 29–30 | `housing_type`, `housing_type_other` | 是 | 「其他」另欄 |
| 問卷 | 居住／同住 | 31–35 | `living_status`, `cohabitation_*` | 是 | 紙本較擠，102 拆同住能力 |
| 問卷 | 教育／婚姻 | 36–38 | `education`, `marital_status*` | 是 | |
| 問卷 | 子女 | 39–42 | `has_children`, `sons_count`, `daughters_count`, `children_same_city` | 是 | 紙本常寫在同一列 |
| 問卷 | 健康自評 | 43 | `health_self_rating` | 是 | 黃：很不好；綠：不太好 |
| 問卷 | 身高體重／體重變化／食慾 | 44–47 | `height_cm`, `weight_kg`, `weight_change_3m`, `appetite_3m` | 是 | 黃：減輕3公斤以上 |
| 問卷 | 疾病史 | 48–50 | `diseases*` | 是 | 黃：心臟病 |
| 問卷 | 住院急診／聽力視力 | 51–55 | `recent_medical_*`, `hearing_*`, `vision_issue` | 是 | 綠：聽力或視力「是」 |
| 問卷 | 親友／鄰居互動 | 56–57 | `family_interaction`, `neighbor_interaction` | 是 | |
| 問卷 | 生活困難 | 58–60 | `life_difficulties*` | 是 | 黃：記憶力不好；綠：交通不便 |
| 問卷 | 煩惱 | 61–63 | `worries*` | 是 | 綠：被詐騙 |
| 問卷 | 求助 | 64–68 | `help_sources*` | 是 | 橘：找不到人可以協助 |
| 問卷 | 訊息管道 | 69–70 | `information_channels*` | 是 | |
| 問卷 | 活動／想做的事 | 71–74 | `past_activities*`, `desired_activities*` | 是 | |
| 問卷 | 居家安全感 | 75 | `home_safety_feeling` | 是 | 黃：很不安全 |
| 問卷 | 兩週情緒三題 | 76–78 | `loneliness_2w`, `depressed_2w`, `loss_interest_2w` | 是 | 綠：幾乎每天（寂寞／失去興趣） |
| 問卷 | 服務意願 | 79–81 | `service_willingness*` | 是 | |
| 二、觀察 | 精神狀況 | 82 | `mental_status` | 是 | 橘：提到自殺意念 |
| 二、觀察 | 自我照顧 | 83–85 | `self_care_*` | 是 | 橘：需人協助移動；黃：異味；綠：輔具移動 |
| 二、觀察 | 衛生／安全 | 86–89 | `home_hygiene_*`, `home_safety_*` | 是 | 觀察題，不要口頭直問 |
| 三、色碼 | 橘／黃／綠結果 | — | 系統計算，見 `high-care-rules.ts` | 是（勾選結果） | **不是 102 欄**，訪員不可手選 |
| 同意書 | 個資／健康庫／簽名 | 90–92 | `consent_*` | 否 | 四張圖沒有；走電子同意 |
| 訪查人 | 社政 5 欄 | 93–97 | `social_worker_*` | 否 | |
| 訪查人 | 民政 5 欄 | 98–102 | `civil_worker_*` | 否 | |

## 訪員填寫原則

- 主檔仍填 102 欄；畫面題組貼紙本分段。
- 特殊題項色碼由後台計算，只顯示結果。
- 90–102 維持同意書與訪查人區塊，不塞進 A3。
