# 衛福部生活關懷表 102 欄 Gap 對照表

> **Phase 2 更新**：訪員 UI 已改為 102 欄（`lib/domain/mohw-life-care-ui.ts`）；GAS 可產生 xlsx 實檔（`MohwLifeCareExporter.gs`）。下表「❌ 無」表示 Phase 1 時尚未有獨立欄位，Phase 2 已在 UI 補上輸入框，但部分仍依賴從個案主檔/訪查流程自動帶入。
>
> **驗收清單**：請改看 [`docs/mohw-life-care-field-acceptance.md`](./mohw-life-care-field-acceptance.md)（含操作步驟與簽核表）。
>
> **P1 選項同步（2026-09-02）**：`mohw-life-care-schema.json` 的 `allowedValues`／`inputType` 已依官方《生活關懷表檔案說明範本》重同步；UI 與驗證改為精確比對官方字串（含 `親戚_其他親屬` 底線），並以 `mohw-life-care-options.ts` 做舊用字別名正規化。

> 對照來源：`生活關懷表匯入範本(1).xlsx` + `生活關懷表檔案說明範本(1).xlsx`  
> 系統現況：`lib/domain/mohw-life-care-ui.ts`（102 欄 UI）

## 摘要

| 狀態 | 欄位數 | 說明 |
|------|--------|------|
| ✅ 有 | 32 | 系統已有對應欄位，可直接或微調後匯出 |
| ⚠️ 部分 | 26 | 有相關資料但結構/格式/來源不符 MOHW |
| ❌ 無 | 44 | 需新增 UI 欄位或後端欄位 |
| **合計** | **102** | |

## 逐欄對照

| # | MOHW 欄位 | 狀態 | 內部 key | 內部來源 | 備註 |
|---|-----------|------|----------|----------|------|
| 1 | 訪查日期 * | ⚠️ 部分 | `visit_date` | visit_meta | 需從派案/簽到帶入 |
| 2 | 訪查開始時間 * | ⚠️ 部分 | `visit_start_time` | visit_meta | 需從簽到帶入 |
| 3 | 訪查結束時間 | ⚠️ 部分 | `visit_end_time` | visit_meta | 需從簽退帶入 |
| 4 | 訪視狀態 * | ⚠️ 部分 | `visit_status` | visit_meta | 對應 visitResult，選項需對齊 MOHW |
| 5 | 備註 | ⚠️ 部分 | `visit_notes` | visit_meta | submission.notes |
| 6 | 姓名 * | ✅ 有 | `name` | new_taipei | — |
| 7 | 性別* | ✅ 有 | `gender` | new_taipei | — |
| 8 | 出生年月日* | ✅ 有 | `birth_date` | new_taipei | 格式需轉民國年 yyy/MM/dd |
| 9 | 身分證字號 * | ✅ 有 | `national_id` | new_taipei | — |
| 10 | 電話 | ✅ 有 | `phone` | new_taipei | — |
| 11 | 手機 | ✅ 有 | `mobile` | new_taipei | — |
| 12 | Line ID 狀態 | ❌ 無 | `line_id_status` | — | 需新增 UI 欄位 |
| 13 | Line ID | ⚠️ 部分 | `line_id` | new_taipei | 有值但缺狀態欄 |
| 14 | 緊急聯絡人姓名 | ⚠️ 部分 | `emergency_contact_name` | new_taipei | 合併欄需拆分 |
| 15 | 緊急聯絡人關係 | ❌ 無 | `emergency_contact_relation` | — | 需新增 |
| 16 | 緊急聯絡人關係-其他說明 | ❌ 無 | `emergency_contact_relation_other` | — | 需新增 |
| 17 | 緊急聯絡人電話 | ❌ 無 | `emergency_contact_phone` | — | 需新增 |
| 18 | 戶籍-縣市* | ⚠️ 部分 | `household_city` | case_registry | 試算表/結構化地址 |
| 19 | 戶籍-鄉鎮區* | ⚠️ 部分 | `household_district` | case_registry | — |
| 20 | 戶籍-村里* | ⚠️ 部分 | `household_village` | case_registry | — |
| 21 | 戶籍-地址 * | ⚠️ 部分 | `household_address` | new_taipei | 合併文字需解析 |
| 22 | 居住地址類型 * | ❌ 無 | `living_address_type` | — | 需新增 |
| 23 | 居住說明 | ❌ 無 | `living_address_note` | — | 需新增 |
| 24 | 居住-縣市 | ⚠️ 部分 | `living_city` | case_registry | — |
| 25 | 居住-鄉鎮區 | ⚠️ 部分 | `living_district` | case_registry | — |
| 26 | 居住-村里 | ⚠️ 部分 | `living_village` | case_registry | — |
| 27 | 居住-地址 | ⚠️ 部分 | `living_address` | new_taipei | — |
| 28 | 居住-其他說明 | ❌ 無 | `living_address_other` | — | 需新增 |
| 29 | 住宅類型 * | ✅ 有 | `housing_type` | new_taipei | — |
| 30 | 住宅類型-其他說明 | ❌ 無 | `housing_type_other` | — | housing_type=其他時必填 |
| 31 | 居住狀況 * | ✅ 有 | `living_status` | new_taipei | — |
| 32 | 同住情形 | ❌ 無 | `cohabitation_status` | — | 需新增 |
| 33 | 同住者為 | ❌ 無 | `cohabitant_relation` | — | 需新增 |
| 34 | 同住者年齡 | ❌ 無 | `cohabitant_age` | — | 需新增 |
| 35 | 同住者無照顧能力說明 | ❌ 無 | `cohabitant_no_care_capacity_note` | — | 需新增 |
| 36 | 教育程度 | ✅ 有 | `education` | new_taipei | — |
| 37 | 婚姻狀況 | ✅ 有 | `marital_status` | new_taipei | — |
| 38 | 婚姻狀況-其他說明 | ❌ 無 | `marital_status_other` | — | 需新增 |
| 39 | 有無子女 * | ⚠️ 部分 | `has_children` | new_taipei | 需拆分 |
| 40 | 兒子數 | ❌ 無 | `sons_count` | — | 需新增 |
| 41 | 女兒數 | ❌ 無 | `daughters_count` | — | 需新增 |
| 42 | 子女同縣市 | ❌ 無 | `children_same_city` | — | 需新增 |
| 43 | 您覺得自己目前健康狀況如何? * | ✅ 有 | `health_self_rating` | new_taipei | — |
| 44 | 身高 * | ✅ 有 | `height_cm` | new_taipei | — |
| 45 | 體重 * | ✅ 有 | `weight_kg` | new_taipei | — |
| 46 | 體重變化 * | ✅ 有 | `weight_change_3m` | new_taipei | — |
| 47 | 食慾狀況 * | ✅ 有 | `appetite_3m` | new_taipei | — |
| 48 | 疾病史 | ✅ 有 | `diseases` | new_taipei | 多選改 ; 分隔 |
| 49 | 疾病史-癌症說明 | ❌ 無 | `diseases_cancer_note` | — | 需新增 |
| 50 | 疾病史-其他說明 | ❌ 無 | `diseases_other_note` | — | 需新增 |
| 51 | 最近3個月是否有住院、手術，或到急診就醫 | ✅ 有 | `recent_medical_event` | new_taipei | — |
| 52 | 住院說明 | ❌ 無 | `recent_medical_note` | — | 需新增 |
| 53 | 重聽 | ✅ 有 | `hearing_issue` | new_taipei | — |
| 54 | 佩戴助聽器 | ❌ 無 | `hearing_aid` | — | 需新增 |
| 55 | 視力不好 | ✅ 有 | `vision_issue` | new_taipei | — |
| 56 | 與親友互動 | ✅ 有 | `family_interaction` | new_taipei | — |
| 57 | 與鄰居互動 | ✅ 有 | `neighbor_interaction` | new_taipei | — |
| 58 | 最近三個月生活所遇到的困難 | ⚠️ 部分 | `life_difficulties_flag` | new_taipei | MOHW 主欄+細項 |
| 59 | 生活困難-細項 | ✅ 有 | `life_difficulties` | new_taipei | — |
| 60 | 生活困難-其他說明 | ❌ 無 | `life_difficulties_other` | — | 需新增 |
| 61 | 最近三個月感到煩惱的事情 | ⚠️ 部分 | `worries_flag` | new_taipei | MOHW 主欄+細項 |
| 62 | 煩惱事情-細項 | ✅ 有 | `worries` | new_taipei | — |
| 63 | 煩惱事情-其他說明 | ❌ 無 | `worries_other` | — | 需新增 |
| 64 | 求助對象 | ⚠️ 部分 | `help_sources_flag` | new_taipei | MOHW 有/無分支 |
| 65 | 求助對象-無的複選選項 | ❌ 無 | `help_sources_none` | — | 需新增 |
| 66 | 求助對象無-其他說明 | ❌ 無 | `help_sources_none_other` | — | 需新增 |
| 67 | 求助對象-有的複選選項 | ⚠️ 部分 | `help_sources_has` | new_taipei | 需拆分 |
| 68 | 求助對象有-其他說明 | ❌ 無 | `help_sources_has_other` | — | 需新增 |
| 69 | 日常生活訊息管道 | ✅ 有 | `information_channels` | new_taipei | — |
| 70 | 訊息管道-其他說明 | ❌ 無 | `information_channels_other` | — | 需新增 |
| 71 | 過去三個月實際參與活動 | ❌ 無 | `past_activities` | — | 需新增 |
| 72 | 過去活動-其他說明 | ❌ 無 | `past_activities_other` | — | 需新增 |
| 73 | 目前特別想做的事 | ❌ 無 | `desired_activities` | — | 需新增 |
| 74 | 目前特別想做的事-其他說明 | ❌ 無 | `desired_activities_other` | — | 需新增 |
| 75 | 您在家中是否感到安全？ | ✅ 有 | `home_safety_feeling` | new_taipei | — |
| 76 | 您是否覺得寂寞？(過去2週) | ✅ 有 | `loneliness_2w` | new_taipei | — |
| 77 | 您是否感覺情緒低落、沮喪或沒有希望？(過去2週) | ✅ 有 | `depressed_2w` | new_taipei | — |
| 78 | 您是否感覺做事情失去興趣或樂趣？(過去2週) | ✅ 有 | `loss_interest_2w` | new_taipei | — |
| 79 | 接受其他服務的意願 | ⚠️ 部分 | `service_willingness_flag` | new_taipei | MOHW 主欄+細項 |
| 80 | 服務意願-細項 | ✅ 有 | `service_willingness` | new_taipei | — |
| 81 | 服務意願-轉介其他說明 | ❌ 無 | `service_willingness_referral_other` | — | 需新增 |
| 82 | 精神狀況 | ⚠️ 部分 | `mental_status` | new_taipei | 部分對應 |
| 83 | 自我照顧情形 | ⚠️ 部分 | `self_care_flag` | new_taipei | MOHW 主欄+細項 |
| 84 | 自我照顧情形-細項 | ✅ 有 | `self_care_observation` | new_taipei | — |
| 85 | 自我照顧情形-其他說明 | ❌ 無 | `self_care_other` | — | 需新增 |
| 86 | 衛生問題 | ✅ 有 | `home_hygiene_issues` | new_taipei | — |
| 87 | 衛生問題-其他說明 | ❌ 無 | `home_hygiene_other` | — | 需新增 |
| 88 | 安全問題 | ✅ 有 | `home_safety_issues` | new_taipei | — |
| 89 | 安全問題-其他說明 | ❌ 無 | `home_safety_other` | — | 需新增 |
| 90 | 個人資料於上開範圍內使用 * | ⚠️ 部分 | `consent_personal_data` | visit_meta | 需對應同意 同意/不同意 |
| 91 | 將這份生活關懷表訪查結果，供國家型健康資料庫(如健保資料、長照資料等)分析使用，僅作為115-116年度獨居老人政策服務成效評估用途 * | ⚠️ 部分 | `consent_health_db` | visit_meta | — |
| 92 | 有立書人本人簽名、蓋章或手印 * | ⚠️ 部分 | `consent_signature` | visit_meta | 簽名有，需轉 是/否 |
| 93 | 社政訪查人-身分 | ❌ 無 | `social_worker_role` | — | 需新增 |
| 94 | 社政訪查人-姓名 | ❌ 無 | `social_worker_name` | — | 需新增 |
| 95 | 社政訪查人-身分證字號 | ❌ 無 | `social_worker_national_id` | — | 需新增 |
| 96 | 社政訪查人-電話 | ❌ 無 | `social_worker_phone` | — | 需新增 |
| 97 | 社政訪查人-日期 | ❌ 無 | `social_worker_date` | — | 需新增 |
| 98 | 民政訪查人-身分 | ❌ 無 | `civil_worker_role` | — | 需新增 |
| 99 | 民政訪查人-姓名 | ❌ 無 | `civil_worker_name` | — | 需新增 |
| 100 | 民政訪查人-身分證字號 | ❌ 無 | `civil_worker_national_id` | — | 需新增 |
| 101 | 民政訪查人-電話 | ❌ 無 | `civil_worker_phone` | — | 需新增 |
| 102 | 民政訪查人-日期 | ❌ 無 | `civil_worker_date` | — | 需新增 |
