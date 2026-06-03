import { Goal, CheckItemType } from "./types";

export interface GoalTemplate {
  goal: Omit<Goal, "id">;
  items: Array<{
    label: string;
    type: CheckItemType;
    target_value?: number | null;
    unit?: string | null;
    options?: string[];
  }>;
}

/**
 * Five-goal 12WY template set.
 *
 * G1  TCF B2          移民語言門檻,9/27 考試  weight 30
 * G2  8/17 入職        收入主線 + 移民財力      weight 25
 * G3  12 月移民送出     文件 / WES / 體檢        weight 15
 * G4  Google L4 stretch  10 月才正式啟動         weight 10
 * G5  山岳 + 耐力賽事   體能線,服務主線不壓垮     weight 10
 *     (身體訊號 sleep/HRV 已併入 G5 作為日打卡)
 *
 * Total weight = 90; the owner can rebalance via the Goals page edit form.
 */
export const TEMPLATES: GoalTemplate[] = [
  {
    goal: {
      name: "G1 TCF B2",
      description: "9/27 考試 + 移民必備。口說 / 作文 / 中→法 / chunk 工具箱",
      why: "TCF B2 是移民法國的語言門檻,優先級最高",
      target_text: "口說 60+ 題、作文 60+ 篇、Chunk 工具箱 150+、家教 6+ 堂、italki 15+、模考 1 次",
      weight: 30,
      active: 1,
      sort_order: 0,
      persona: null,
      context_json: null,
    },
    items: [
      { label: "今日口說裸講", type: "bool" },
      { label: "口說錄音時長", type: "minutes", target_value: 30, unit: "min" },
      { label: "中→法作文段落", type: "number", target_value: 1, unit: "篇" },
      { label: "新增 Chunks", type: "number", target_value: 3, unit: "個" },
      { label: "今日最大卡點", type: "text" },
    ],
  },
  {
    goal: {
      name: "G2 8/17 入職",
      description: "AI 應用工程師優先 / Backend 大公司保底。6/8 開始投履歷",
      why: "收入主線 + 移民財力證明",
      target_text: "Resume 2 版、Behavioral stories 8 篇、投遞 30+、面試 5+、1+ offer",
      weight: 25,
      active: 1,
      sort_order: 1,
      persona: null,
      context_json: null,
    },
    items: [
      { label: "Resume 工作", type: "minutes", target_value: 30, unit: "min" },
      { label: "投遞數", type: "number", target_value: 2, unit: "間" },
      { label: "內推聯絡", type: "number", target_value: 0, unit: "人" },
      { label: "面試", type: "number", target_value: 0, unit: "場" },
      { label: "Behavioral story 工作", type: "text" },
    ],
  },
  {
    goal: {
      name: "G3 12 月移民送出",
      description: "TCF 成績 + WES + 文件 audit + reference + 無犯罪 + 體檢",
      why: "最終目標,所有其他事都服務這個 deadline",
      target_text: "12 月前所有移民文件齊備並送出",
      weight: 15,
      active: 1,
      sort_order: 2,
      persona: null,
      context_json: null,
    },
    items: [
      { label: "今日有處理移民文件", type: "bool" },
      { label: "處理分鐘", type: "minutes", target_value: 0, unit: "min" },
      { label: "今日完成項目", type: "text" },
      { label: "卡點 / 等待中項目", type: "text" },
    ],
  },
  {
    goal: {
      name: "G4 Google L4 stretch",
      description: "10 月正式啟動的 bonus 線。LC timed / SD / behavioral / referral",
      why: "Stretch goal,如果 TCF + 入職穩了就推進",
      target_text: "10/1 後 referral 啟動,LC unseen 15 分內 80%、SD 1 hr 完整框架、Behavioral mock 3+",
      weight: 10,
      active: 1,
      sort_order: 3,
      persona: null,
      context_json: null,
    },
    items: [
      { label: "LC 舊題重打", type: "number", target_value: 5, unit: "題" },
      { label: "LC 未見 timed", type: "number", target_value: 1, unit: "題" },
      { label: "口述 complexity", type: "bool" },
      { label: "口述 edge cases", type: "bool" },
      { label: "今日 SD 題目", type: "text" },
      { label: "今日最弱 pattern", type: "text" },
    ],
  },
  {
    goal: {
      name: "G5 山岳 + 耐力賽事",
      description: "6/28 北海道 100K → 7 月三場山岳 → 8/25 表銀座 → 10–12 月馬拉松。服務主線,不可壓垮 TCF",
      why: "體能 + 生活線,保 HRV / 睡眠 / 情緒,7 月山行安全完成不受傷",
      target_text: "週 5 hr 運動、7 月山行安全、HRV 連跌 ≤ 2 天、傷 0、9/27 前不增強度、TCF 後再衝馬拉松",
      weight: 10,
      active: 1,
      sort_order: 4,
      persona: null,
      context_json: null,
    },
    items: [
      { label: "睡眠 (h)", type: "number", target_value: 7, unit: "h" },
      { label: "HRV", type: "number", unit: "ms" },
      { label: "疲勞", type: "scale" },
      { label: "腿/膝/腳踝異常", type: "text" },
      { label: "運動分鐘", type: "minutes", target_value: 45, unit: "min" },
      { label: "今日是山岳訓練", type: "bool" },
      { label: "訓練類型", type: "choice", options: ["easy run", "坡/樓梯", "長走/越野", "肌力", "mobility/恢復", "比賽", "rest"] },
      { label: "強度", type: "scale" },
    ],
  },
];
