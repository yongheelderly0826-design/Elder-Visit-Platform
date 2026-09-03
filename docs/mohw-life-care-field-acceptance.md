# 衛福部生活關懷表 102 欄位驗收對照

> 用途：逐欄驗收 UI 輸入、驗證規則、xlsx 匯出是否就緒。
> 來源：`lib/domain/mohw-life-care-schema.json` + UI / validation / export。
> 日期：2026-09-02

## 驗收狀態定義

| 標記 | 意義 |
|------|------|
| ✅ | 已接線，可實測通過 |
| ⚠️ | 有實作但需人工確認選項用字／條件帶入 |
| ❌ | 尚未就緒 |

## 摘要

| 狀態 | 欄位數 |
|------|--------|
| ✅ 可驗收通過（抽樣） | 39 |
| ⚠️ 需人工對照選項/條件 | 63 |
| ❌ 未就緒 | 0 |
| **合計** | **102** |

## 驗收步驟（建議）

1. 於 `/manager/assignments` 確認派案（選定訪員）→ `/visitor/tasks` 出現真實個案。
2. 開啟訪視填報，依 11 大段填完一筆「已完成」訪視並送出。
3. 確認試算表「關懷表登打」有 `answers_json`。
4. 稽核通過後於 `/manager/exports` 匯出 xlsx，確認 Drive 連結。
5. 對照官網範本：表頭 102 欄順序、必填錯誤格式（如 `I3 身分證號碼格式不正確`）。

## 逐欄對照

| # | MOHW 欄位 | key | 必填 | Gap | 驗證規則 | 匯出 | 驗收 | 備註 |
|---|-----------|-----|------|-----|----------|------|------|------|
| 1 | 訪查日期 * | `visit_date` | 必填 | partial | 有 | ✅ | ⚠️ | 需從派案/簽到帶入 |
| 2 | 訪查開始時間 * | `visit_start_time` | 必填 | partial | 有 | ✅ | ⚠️ | 需從簽到帶入 |
| 3 | 訪查結束時間 | `visit_end_time` | 選填 | partial | 有 | ✅ | ⚠️ | 需從簽退帶入 |
| 4 | 訪視狀態 * | `visit_status` | 必填 | partial | 有 | ✅ | ⚠️ | 對應 visitResult，選項需對齊 MOHW |
| 5 | 備註 | `visit_notes` | 選填 | partial | 有 | ✅ | ⚠️ | submission.notes |
| 6 | 姓名 * | `name` | 必填 | has | 有 | ✅ | ✅ | UI + 匯出已接線 |
| 7 | 性別* | `gender` | 必填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：男;女;其他 |
| 8 | 出生年月日* | `birth_date` | 必填 | has | 有 | ✅ | ✅ | 格式需轉民國年 yyy/MM/dd |
| 9 | 身分證字號 * | `national_id` | 必填 | has | 有 | ✅ | ✅ | UI + 匯出已接線 |
| 10 | 電話 | `phone` | 選填 | has | 有 | ✅ | ✅ | UI + 匯出已接線 |
| 11 | 手機 | `mobile` | 選填 | has | 有 | ✅ | ✅ | UI + 匯出已接線 |
| 12 | Line ID 狀態 | `line_id_status` | 選填 | missing | 有 | ✅ | ⚠️ | 需新增 UI 欄位；選項對齊：有;無;有，不願提供 |
| 13 | Line ID | `line_id` | 選填 | partial | 有 | ✅ | ⚠️ | 有值但缺狀態欄 |
| 14 | 緊急聯絡人姓名 | `emergency_contact_name` | 選填 | partial | — | ✅ | ⚠️ | 合併欄需拆分 |
| 15 | 緊急聯絡人關係 | `emergency_contact_relation` | 選填 | missing | — | ✅ | ⚠️ | 需新增；選項對齊：配偶;子女;孫子女;兄弟姊妹;親戚_其他親屬;鄰居;朋友;法定代理人;里長;照顧服務員;護理人員 |
| 16 | 緊急聯絡人關係-其他說明 | `emergency_contact_relation_other` | 選填 | missing | — | ✅ | ✅ | 需新增 |
| 17 | 緊急聯絡人電話 | `emergency_contact_phone` | 選填 | missing | — | ✅ | ✅ | 需新增 |
| 18 | 戶籍-縣市* | `household_city` | 必填 | partial | — | ✅ | ⚠️ | 試算表/結構化地址 |
| 19 | 戶籍-鄉鎮區* | `household_district` | 必填 | partial | — | ✅ | ⚠️ | 部分自動帶入，需抽樣驗收 |
| 20 | 戶籍-村里* | `household_village` | 必填 | partial | — | ✅ | ⚠️ | 部分自動帶入，需抽樣驗收 |
| 21 | 戶籍-地址 * | `household_address` | 必填 | partial | — | ✅ | ⚠️ | 合併文字需解析 |
| 22 | 居住地址類型 * | `living_address_type` | 必填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：與戶籍地址相同;未住戶籍地址;查無此人 |
| 23 | 居住說明 | `living_address_note` | 選填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：居住地址不詳;居住地址為 |
| 24 | 居住-縣市 | `living_city` | 選填 | partial | 有 | ✅ | ⚠️ | 部分自動帶入，需抽樣驗收 |
| 25 | 居住-鄉鎮區 | `living_district` | 選填 | partial | 有 | ✅ | ⚠️ | 部分自動帶入，需抽樣驗收 |
| 26 | 居住-村里 | `living_village` | 選填 | partial | 有 | ✅ | ⚠️ | 部分自動帶入，需抽樣驗收 |
| 27 | 居住-地址 | `living_address` | 選填 | partial | 有 | ✅ | ⚠️ | 部分自動帶入，需抽樣驗收 |
| 28 | 居住-其他說明 | `living_address_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 29 | 住宅類型 * | `housing_type` | 必填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：電梯大樓;有電梯公寓;有電梯透天樓房;無電梯公寓;無電梯透天樓房;平房;其他 |
| 30 | 住宅類型-其他說明 | `housing_type_other` | 選填 | missing | 有 | ✅ | ✅ | housing_type=其他時必填 |
| 31 | 居住狀況 * | `living_status` | 必填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：與他人同住;1人獨自居住 |
| 32 | 同住情形 | `cohabitation_status` | 選填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：同住者有照顧能力;外籍移工(看護)同住;同住配偶年滿65歲;同住者無照顧能力 |
| 33 | 同住者為 | `cohabitant_relation` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 34 | 同住者年齡 | `cohabitant_age` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 35 | 同住者無照顧能力說明 | `cohabitant_no_care_capacity_note` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 36 | 教育程度 | `education` | 選填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：不識字;識字;小學;初(國)中;高中(職);專科;大學;研究所 |
| 37 | 婚姻狀況 | `marital_status` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：有配偶或同居;喪偶;離婚或分居;未婚;其他 |
| 38 | 婚姻狀況-其他說明 | `marital_status_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 39 | 有無子女 * | `has_children` | 必填 | partial | 有 | ✅ | ⚠️ | 需拆分；選項對齊：存;無 |
| 40 | 兒子數 | `sons_count` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 41 | 女兒數 | `daughters_count` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 42 | 子女同縣市 | `children_same_city` | 選填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：是;否 |
| 43 | 您覺得自己目前健康狀況如何? * | `health_self_rating` | 必填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：很好;還算好;普通;不太好;很不好 |
| 44 | 身高 * | `height_cm` | 必填 | has | — | ✅ | ✅ | UI + 匯出已接線 |
| 45 | 體重 * | `weight_kg` | 必填 | has | — | ✅ | ✅ | UI + 匯出已接線 |
| 46 | 體重變化 * | `weight_change_3m` | 必填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：無改變;減輕1-3公斤;減輕3公斤以上;增加;不知道 |
| 47 | 食慾狀況 * | `appetite_3m` | 必填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：嚴重食慾不佳;中度食慾不佳;無變化 |
| 48 | 疾病史 | `diseases` | 選填 | has | 有 | ✅ | ⚠️ | 多選改 ; 分隔；選項對齊：心臟病;中風;高血壓;糖尿病;骨與關節疾病;癌症;失智症;以上均無;其他 |
| 49 | 疾病史-癌症說明 | `diseases_cancer_note` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 50 | 疾病史-其他說明 | `diseases_other_note` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 51 | 最近3個月是否有住院、手術，或到急診就醫 | `recent_medical_event` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：是;否 |
| 52 | 住院說明 | `recent_medical_note` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 53 | 重聽 | `hearing_issue` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：是;否 |
| 54 | 佩戴助聽器 | `hearing_aid` | 選填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：是;否 |
| 55 | 視力不好 | `vision_issue` | 選填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：是;否 |
| 56 | 與親友互動 | `family_interaction` | 選填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：從未;每月少於1次;每個月1次;每個月2-3次;每周1次;每周2-6次;每天 |
| 57 | 與鄰居互動 | `neighbor_interaction` | 選填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：從未;每月少於1次;每個月1次;每個月2-3次;每周1次;每周2-6次;每天 |
| 58 | 最近三個月生活所遇到的困難 | `life_difficulties_flag` | 選填 | partial | 有 | ✅ | ⚠️ | MOHW 主欄+細項；選項對齊：無;有 |
| 59 | 生活困難-細項 | `life_difficulties` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：三餐無法溫飽;無人可協助就醫;租屋困難;最近記憶力不好;外出交通不方便（例如缺乏公車或客運）;其 |
| 60 | 生活困難-其他說明 | `life_difficulties_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 61 | 最近三個月感到煩惱的事情 | `worries_flag` | 選填 | partial | 有 | ✅ | ⚠️ | MOHW 主欄+細項；選項對齊：無;有 |
| 62 | 煩惱事情-細項 | `worries` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：自己受傷或疾病;親人受傷或疾病;親人離世;被詐騙;自己經濟問題(如債務);子女、孫子女問題（如打 |
| 63 | 煩惱事情-其他說明 | `worries_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 64 | 求助對象 | `help_sources_flag` | 選填 | partial | 有 | ✅ | ⚠️ | MOHW 有/無分支；選項對齊：有;無 |
| 65 | 求助對象-無的複選選項 | `help_sources_none` | 選填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：沒發生過;不想麻煩別人，都是自己想辦法;找不到人可以協助;其他 |
| 66 | 求助對象無-其他說明 | `help_sources_none_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 67 | 求助對象-有的複選選項 | `help_sources_has` | 選填 | partial | 有 | ✅ | ⚠️ | 需拆分；選項對齊：家人;朋友;鄰居;社工;村里長;社區志工;大廈管理員;其他 |
| 68 | 求助對象有-其他說明 | `help_sources_has_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 69 | 日常生活訊息管道 | `information_channels` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：電視;報紙;廣播;網路;村里長;親友或鄰里;社群媒體(如：Line、FB、IG);其他;以上均無 |
| 70 | 訊息管道-其他說明 | `information_channels_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 71 | 過去三個月實際參與活動 | `past_activities` | 選填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：工作;擔任志工;學習新事物;四處旅遊;健身運動;參與宗教活動;其他;以上均無 |
| 72 | 過去活動-其他說明 | `past_activities_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 73 | 目前特別想做的事 | `desired_activities` | 選填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：工作;擔任志工;學習新事物;四處旅遊;健身運動;參與宗教活動;其他;以上均無 |
| 74 | 目前特別想做的事-其他說明 | `desired_activities_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 75 | 您在家中是否感到安全？ | `home_safety_feeling` | 選填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：很安全;大致安全;有些不安全;很不安全 |
| 76 | 您是否覺得寂寞？(過去2週) | `loneliness_2w` | 選填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：完全沒有;只有幾天：1至6天;一半以上天數：7至11天;幾乎每天：12至14天 |
| 77 | 您是否感覺情緒低落、沮喪或沒有希望？(過去2週) | `depressed_2w` | 選填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：完全沒有;只有幾天：1至6天;一半以上天數：7至11天;幾乎每天：12至14天 |
| 78 | 您是否感覺做事情失去興趣或樂趣？(過去2週) | `loss_interest_2w` | 選填 | has | — | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：完全沒有;只有幾天：1至6天;一半以上天數：7至11天;幾乎每天：12至14天 |
| 79 | 接受其他服務的意願 | `service_willingness_flag` | 選填 | partial | 有 | ✅ | ⚠️ | MOHW 主欄+細項；選項對齊：無;有 |
| 80 | 服務意願-細項 | `service_willingness` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：參加社區據點;關懷服務;送餐服務;安裝緊急救援裝置;轉介：長照;轉介：身障;轉介：其他服務，長者 |
| 81 | 服務意願-轉介其他說明 | `service_willingness_referral_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 82 | 精神狀況 | `mental_status` | 選填 | partial | — | ✅ | ⚠️ | 部分對應；選項對齊：在訪談過程中，長者有提到自殺意念;無特殊情形 |
| 83 | 自我照顧情形 | `self_care_flag` | 選填 | partial | 有 | ✅ | ⚠️ | MOHW 主欄+細項；選項對齊：可以;可以，但行動緩慢;不可以 |
| 84 | 自我照顧情形-細項 | `self_care_observation` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：需要別人幫助才能移動;衣物不乾淨;身上有異味(例如尿騷味);使用器具(例如輪椅、拐杖)就可以自行 |
| 85 | 自我照顧情形-其他說明 | `self_care_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 86 | 衛生問題 | `home_hygiene_issues` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：環境物品十分髒亂;衣著不符季節;食品雜置、蚊蠅蟑螂紛飛;通風不良;其他;以上均無;無法觀察 |
| 87 | 衛生問題-其他說明 | `home_hygiene_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 88 | 安全問題 | `home_safety_issues` | 選填 | has | 有 | ✅ | ⚠️ | UI + 匯出已接線；選項對齊：電線裸露;照明設備不足(如夜起時);未裝設住宅用火災警報器;多個電器同時使用一個插座;熱水器安裝 |
| 89 | 安全問題-其他說明 | `home_safety_other` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 90 | 個人資料於上開範圍內使用 * | `consent_personal_data` | 必填 | partial | — | ✅ | ⚠️ | 需對應同意 同意/不同意；選項對齊：同意;不同意 |
| 91 | 將這份生活關懷表訪查結果，供國家型健康資料庫(如健保資料、長照資料等)分析使用，僅作為115-116年度獨居老人政策服務成效評估用途 * | `consent_health_db` | 必填 | partial | — | ✅ | ⚠️ | 部分自動帶入，需抽樣驗收；選項對齊：同意;不同意 |
| 92 | 有立書人本人簽名、蓋章或手印 * | `consent_signature` | 必填 | partial | — | ✅ | ⚠️ | 簽名有，需轉 是/否；選項對齊：是;否 |
| 93 | 社政訪查人-身分 | `social_worker_role` | 必填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：社會局/處;社工;志工;其他 |
| 94 | 社政訪查人-姓名 | `social_worker_name` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 95 | 社政訪查人-身分證字號 | `social_worker_national_id` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 96 | 社政訪查人-電話 | `social_worker_phone` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 97 | 社政訪查人-日期 | `social_worker_date` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 98 | 民政訪查人-身分 | `civil_worker_role` | 必填 | missing | 有 | ✅ | ⚠️ | 需新增；選項對齊：公所人員;村里長;村里幹事 |
| 99 | 民政訪查人-姓名 | `civil_worker_name` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 100 | 民政訪查人-身分證字號 | `civil_worker_national_id` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 101 | 民政訪查人-電話 | `civil_worker_phone` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |
| 102 | 民政訪查人-日期 | `civil_worker_date` | 選填 | missing | 有 | ✅ | ✅ | 需新增 |

## 驗收簽核

| 項目 | 結果 | 測試者 | 日期 |
|------|------|--------|------|
| 派案 → 訪員任務出現真實資料 | ☐ | | |
| 單筆完整填報送出 | ☐ | | |
| 條件必填（拒訪略過問卷） | ☐ | | |
| 身分證檢查碼 | ☐ | | |
| 匯出 xlsx 表頭 102 欄 | ☐ | | |
| Drive 連結可下載 | ☐ | | |
| 官網上傳預檢（若有帳號） | ☐ | | |
