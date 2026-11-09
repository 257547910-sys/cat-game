# 关卡模式与季节更新说明文档 (Level Mode & Season System Guide)

本文件夹为后续扩展**关卡模式（Level / Campaign Mode）**预留的独立架构，与现有的无尽闯关模式（Endless Mode）无缝兼容。

---

## 📁 目录结构
```text
popcat_beach_game/
├── index.html                   # 游戏主入口，已自适应手机屏幕
├── style.css                    # 现代像素海滩唯美风格样式表
├── js/
│   ├── audio.js                 # Web Audio API 音效引擎（猫叫、消除Pop音、海浪波动、海鸥叫、道具音）
│   ├── board.js                 # 10x10 网格消除与纯垂直重力下落引擎
│   ├── props.js                 # 染色棒道具系统（选色交互与小鱼饼干兑换）
│   ├── scoring.js               # 原版精确消除平方公式与收尾奖励算法
│   ├── storage.js               # 自动存档、读档与全球排行榜系统
│   ├── wheel.js                 # 每日幸运大转盘（免费抽饼干与道具）
│   ├── leaderboard.js           # 全球高分榜展示面板
│   ├── effects.js               # 海洋波动、海鸥翱翔、眨眼动效与季节主题切换器
│   └── main.js                  # 游戏主状态机循环
├── assets/
│   └── images/
│       ├── cats/                # 5 种颜色猫咪（含正常态与眨眼帧）
│       ├── items/               # 染色棒 (wand.png) 与 小鱼饼干 (fish_biscuit.png)
│       └── backgrounds/         # 四季海滩背景（夏、春、秋、冬）
│           ├── summer.jpg       # 默认：盛夏海滩
│           ├── spring.jpg       # 暖春樱海
│           ├── autumn.jpg       # 金秋落霞
│           └── winter.jpg       # 凛冬晶雪
└── levels/
    ├── README.md                # 本说明文件
    ├── stages_config.json       # 关卡模式配置表（目标分、星级、专属奖励、季节背景）
    └── level_mode.js            # 关卡管理器模块
```

---

## 🌸 四季背景系统说明
游戏内置了春夏秋冬 4 套高画质海滩场景，位于 `assets/images/backgrounds/`：
1. **`summer.jpg`**：盛夏蔚蓝海滩、椰树与沙滩遮阳伞（默认开局）。
2. **`spring.jpg`**：粉樱与薄荷绿春季暖风海滩。
3. **`autumn.jpg`**：暖金色黄昏落日沙滩。
4. **`winter.jpg`**：水晶冰蓝与雪花覆滩冬日极光海。

玩家可在游戏右上角点击 **🌸 按钮**随时自由切换四季，程序亦支持随关卡推进自动切换！

---

## 🎯 关卡模式扩展方法
在 `levels/stages_config.json` 中可任意添加或修改关卡：
- `stageId`: 关卡序号
- `name`: 关卡名称（如“海滩初遇”）
- `season`: 指定背景（`summer` / `spring` / `autumn` / `winter`）
- `targetScore`: 本关通关目标分
- `stars`: 1星、2星、3星所需分数线 `[1000, 1500, 2000]`
- `rewardBiscuits`: 通关赠送小鱼饼干数量
- `rewardWands`: 通关赠送染色棒数量
- `intro`: 关卡开局提示语或策略指导
