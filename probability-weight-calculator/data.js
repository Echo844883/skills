/**
 * 数据定义：目标场景（GOALS）与可选评估项（ITEMS）
 *
 * GOALS[goalId].weights 是"该目标下，各评估项默认应占多少权重分"的基准表，
 * 每套权重合计为 100。用户实际勾选哪些项后，会按已选项重新归一化到 100。
 * 未在某目标权重表中出现、或权重为 0 的项，不会在该目标下展示。
 *
 * 这是一套经验规则，不是严谨的统计模型，仅用于辅助自我评估、理清优先级。
 */

const GOALS = {
  kaoyan: {
    id: "kaoyan",
    name: "考研（研究生统考）",
    tagline: "初试成绩是决定性因素，专业背景是加分项",
    weights: {
      gpa: 10,
      cet: 8,
      competition: 4,
      research: 4,
      internship: 3,
      project: 3,
      leadership: 2,
      langtest: 1,
      cert: 2,
      examprep: 55,
      fit: 8,
    },
  },
  baoyan: {
    id: "baoyan",
    name: "保研 / 推免",
    tagline: "综合排名、竞赛与科研经历是核心竞争力",
    weights: {
      gpa: 28,
      cet: 10,
      competition: 20,
      research: 16,
      internship: 5,
      project: 5,
      leadership: 4,
      langtest: 3,
      cert: 2,
      examprep: 0,
      fit: 7,
    },
  },
  job: {
    id: "job",
    name: "本科就业",
    tagline: "实习与项目经验是用人单位最看重的部分",
    weights: {
      gpa: 8,
      cet: 5,
      competition: 4,
      research: 5,
      internship: 25,
      project: 20,
      leadership: 5,
      langtest: 2,
      cert: 8,
      examprep: 0,
      fit: 18,
    },
  },
};

const ITEMS = {
  gpa: {
    name: "专业课程成绩 / GPA 排名",
    hint: "在同专业、同年级中的成绩排名情况",
  },
  cet: {
    name: "英语四六级（CET-4/6）",
    hint: "六级分数、通过情况，是否有明显高分",
  },
  competition: {
    name: "学科知识竞赛获奖",
    hint: "专业相关竞赛的获奖级别与含金量（校级 / 省级 / 国家级）",
  },
  research: {
    name: "科研项目 / 学术论文",
    hint: "参与课题、发表论文、专利、大创项目等经历",
  },
  internship: {
    name: "实习经历",
    hint: "实习单位质量、时长与目标岗位的相关度",
  },
  project: {
    name: "项目 / 编程实践经验",
    hint: "个人项目、竞赛项目、开源贡献等实操能力证明",
  },
  leadership: {
    name: "学生工作 / 社团经历",
    hint: "学生组织任职、社会实践、志愿服务等经历",
  },
  langtest: {
    name: "出国语言成绩（雅思 / 托福等）",
    hint: "如目标涉及海外申请可填写，不适用可跳过",
  },
  cert: {
    name: "职业资格 / 技能证书",
    hint: "如计算机等级、行业资格证、软件著作权等",
  },
  examprep: {
    name: "目标考试复习 / 模拟成绩",
    hint: "如考研初试科目的复习进度与模拟分数，是考研成功与否的核心因素",
  },
  fit: {
    name: "目标匹配度自评",
    hint: "你与目标院校 / 岗位要求的整体契合程度，可结合报录比、岗位竞争激烈度主观判断",
  },
};

const IMPORTANCE_WEIGHTS = {
  low: 5,
  medium: 10,
  high: 18,
};

const DIFFICULTY_LABELS = [
  { value: 1, label: "较易", desc: "目标竞争压力不大，如普通院校 / 常规岗位" },
  { value: 2, label: "适中偏易", desc: "有一定竞争，但把握较大" },
  { value: 3, label: "中等", desc: "竞争正常激烈，需要认真准备" },
  { value: 4, label: "较难", desc: "热门方向 / 名校 / 热门岗位，竞争激烈" },
  { value: 5, label: "顶尖激烈", desc: "如顶尖名校、头部大厂等极高竞争场景" },
];
