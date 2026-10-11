export type EmptyChatPromptCategoryId = 'life' | 'technology' | 'tools'

type TenPromptTuple = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string
]

export interface EmptyChatPromptCategory {
  id: EmptyChatPromptCategoryId
  label: string
  prompts: TenPromptTuple
}

export const EMPTY_CHAT_PROMPT_CATEGORIES: readonly EmptyChatPromptCategory[] = [
  {
    id: 'life',
    label: '生活问答',
    prompts: [
      '一个人住，怎样安排一周的晚餐既省事又营养均衡？',
      '最近总是睡前刷手机到很晚，帮我制定一个容易坚持的调整计划',
      '第一次去朋友家里做客，需要注意哪些礼貌和细节？',
      '久坐办公的人，平时可以做哪些简单的拉伸和活动？',
      '帮我制定一个不太累、适合工作日执行的 7 天生活整理计划',
      '怎样礼貌地拒绝一场不想参加的聚会，又不让朋友感到被冷落？',
      '工资到账后总是不知不觉花掉，帮我设计一个简单的月度预算方法',
      '准备三天两夜的短途旅行，行李怎样精简到一个背包？',
      '周末只有一天休息，怎样安排才能真正放松又不会虚度？',
      '很久没有运动了，帮我制定一个循序渐进的两周恢复计划'
    ]
  },
  {
    id: 'technology',
    label: '技术问题',
    prompts: [
      '用通俗的例子解释 React 中 state 和 ref 的区别及使用场景',
      '如何为 TypeScript 后端设计统一、好维护的 API 错误处理？',
      'React 页面出现长列表卡顿时，应该按什么顺序排查和优化？',
      '请解释 SSE 流式传输的工作原理，以及断线后如何可靠恢复',
      '数据库查询变慢时，怎样判断是否需要添加索引？',
      '前端登录状态应该如何设计，才能安全处理 Access Token 的过期和刷新？',
      '一个 React 组件职责越来越多时，应该依据什么边界进行拆分？',
      '如何设计大文件分片上传，并支持暂停、重试和断点续传？',
      '请对比 WebSocket、SSE 和普通轮询，说明各自适合的业务场景',
      '怎样为同时支持浅色和暗黑模式的前端项目设计颜色变量？'
    ]
  },
  {
    id: 'tools',
    label: '工具能力',
    prompts: [
      '查询我当前位置未来一周的天气，并给出穿衣和出行建议',
      '查找我附近适合一个人吃饭的地方，并说明推荐理由',
      '查询今天 AI 行业最重要的 5 条新闻，并总结可能的影响',
      '搜索 React 近期值得关注的官方更新，并整理成简明要点',
      '生成一张温暖明亮的插画：一只小猴子在窗边使用电脑',
      '查询今天人民币兑美元的汇率，并解释近期变化趋势',
      '搜索本周值得关注的开源 AI 项目，并按用途分类介绍',
      '查找我当前位置附近适合安静工作的咖啡店，并给出选择建议',
      '生成一张可爱的猫咪插画：猫咪趴在窗边晒太阳，画面温暖、细节丰富',
      '生成一张深蓝色科技风的 AI 产品宣传海报'
    ]
  }
]
