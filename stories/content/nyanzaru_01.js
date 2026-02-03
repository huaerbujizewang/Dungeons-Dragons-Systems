const storyContent = {
    bg: "assets/stories/backgrounds/court_trial_dusk.jpg",
    assets: {
        "赫尔曼": "assets/stories/npcs/herman_van_kleist.png",
        "公诉人": "assets/stories/npcs/prosecutor.png",
        "婕萨敏": "assets/stories/npcs/jessamine.png",
        "伊方": "assets/stories/npcs/ifan_talroa.png",
        "克薇欧泽": "assets/stories/npcs/kwayothe.png",
        "乔巴尔": "assets/stories/npcs/jobal.png",
        "瓦康嘎": "assets/stories/npcs/wakanga_otamu.png",
        "艾珂内": "assets/stories/npcs/ekene_afa.png",
        "绛则": "assets/stories/npcs/zhanthi.png"
    },
    lines: [
        // --- 开场 ---
        { speaker: "旁白", emotion: "", text: "FR1494 2月21日" },
        { speaker: "旁白", emotion: "", text: "原“金色王座”大厅。" },
        { speaker: "旁白", emotion: "", text: "昔日金碧辉煌的金色王座大厅此刻寒气逼人。原本挂满大厅的色彩鲜艳的丝绸和异国挂毯已被扯下，取而代之的是占领军冷峻的军旗。" },
        { speaker: "旁白", emotion: "", text: "七张曾经象征着至高权力的王座被移到了大厅中央的低处，七位曾经不可一世的贸易亲王此刻皆戴着沉重的镣铐。" },
        { speaker: "旁白", emotion: "", text: "大厅周围站满了荷枪实弹的异界士兵，而旁听席上则是神色复杂的楚尔特平民。他们从未想过能看到这一幕。" },
        { speaker: "旁白", emotion: "", text: "随着一声沉闷的法槌巨响，全场肃静。" },
        
        // --- 赫尔曼开庭 ---
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "肃静。现在开始审理‘南扎路港有组织犯罪集团’一案。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "根据《占领区临时治安管理法》及《反人类罪特别法案》，本庭将对被告七人进行合并审理。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "所谓的贸易亲王，只是一个长期垄断、勒索、谋杀并以此牟利的非法卡特尔组织。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "公诉人，开始宣读起诉书。" },

        // --- 婕萨敏 ---
        { speaker: "公诉人", emotion: "公诉人", text: "被告婕萨敏，南扎路港所谓的‘裁决’制度的实际控制人。" },
        { speaker: "公诉人", emotion: "公诉人", text: "根据查获的账本，你经手贩卖了至少四百份‘裁决令’。" },
        
        { speaker: "婕萨敏", emotion: "婕萨敏", text: "那是为了避免更混乱的私斗。我是在出售‘秩序’。如果仇恨无法宣泄，城市就会燃烧。" },
        { speaker: "婕萨敏", emotion: "婕萨敏", text: "如果有人愿意付钱买另一个人的命，这只是市场需求。" },
        { speaker: "婕萨敏", emotion: "婕萨敏", text: "在这个丛林里，生命本来就有价格。" },

        { speaker: "公诉人", emotion: "公诉人", text: "对此辩解，控方予以驳回。在文明社会，生命权不可通过商业契约转让。" },
        { speaker: "公诉人", emotion: "公诉人", text: "在我们的法律中，这被称为一级谋杀、雇凶杀人以及反人类罪。" },
        { speaker: "公诉人", emotion: "公诉人", text: "你将生命标价，将谋杀合法化。你的存在本身，就是对文明底线的践踏。" },
        { speaker: "公诉人", emotion: "公诉人", text: "此外，你私藏并制造大量剧毒生化制剂。" },
        { speaker: "公诉人", emotion: "公诉人", text: "考虑到你深受某种坏死性诅咒的影响，医学鉴定团认为你已构成生物危害源。" },
        { speaker: "公诉人", emotion: "公诉人", text: "基于法律与公共卫生安全，判决建议：死刑，并立即火化。" },

        // --- 伊方·塔若阿 ---
        { speaker: "伊方·塔若阿", emotion: "伊方", text: "不！你们不能这么判！我是商人！我和那些蛇人只是……只是商业往来！" },
        { speaker: "伊方·塔若阿", emotion: "伊方", text: "我可以给你们钱！我有散塔林会的门路！我可以帮你们管理这座城市！我有用！别杀我！" },

        { speaker: "公诉人", emotion: "公诉人", text: "请控制你的情绪。塔若阿先生，你的罪行不在于贪婪，而在于通敌叛国。" },
        { speaker: "公诉人", emotion: "公诉人", text: "证据显示，你长期向奥姆城的蛇人——一种被认定为极度危险的非人恐怖组织——提供资金和情报。" },
        { speaker: "公诉人", emotion: "公诉人", text: "你出卖探险队的位置换取保护费，导致数百名探险者失踪或死亡。这属于间接故意杀人。" },
        { speaker: "公诉人", emotion: "公诉人", text: "资助敌对异种族屠杀人类同胞，是不可饶恕的重罪。" },
        { speaker: "公诉人", emotion: "公诉人", text: "判决建议：死刑，剥夺政治权利终身。" },

        // --- 克薇欧泽 ---
        { speaker: "公诉人", emotion: "公诉人", text: "关于被告克薇欧泽。除了垄断民生资源以此哄抬物价的经济罪名外，最令人发指的罪行发生在你的私人地牢中。" },
        { speaker: "公诉人", emotion: "公诉人", text: "我们发现了大量酷刑器具。你并未经任何司法程序，便对竞争对手和平民动用私刑。" },

        { speaker: "克薇欧泽", emotion: "克薇欧泽", text: "那是献给卡署斯的试炼！火能净化灵魂的杂质！" },
        { speaker: "克薇欧泽", emotion: "克薇欧泽", text: "你们这些没有信仰的蛮夷，根本不懂得痛苦的神圣性！伊克赛丝和英达尔是我的爱人，是神赐的伴侣！" },

        { speaker: "公诉人", emotion: "公诉人", text: "针对被告关于‘伴侣’的陈述，经法师顾问鉴定，这两者实为深渊邪魔。" },
        { speaker: "公诉人", emotion: "公诉人", text: "你不仅实施酷刑，更犯传播邪教罪以及反人类罪。" },
        { speaker: "公诉人", emotion: "公诉人", text: "你的信仰自由不包括通过折磨他人来获得快感。" },
        { speaker: "公诉人", emotion: "公诉人", text: "判决建议：死刑，建议执行火刑。" },

        // --- 乔巴尔 ---
        { speaker: "乔巴尔", emotion: "乔巴尔", text: "荒谬！看看我脸上的伤疤！这是我在丛林里流的血！" },
        { speaker: "乔巴尔", emotion: "乔巴尔", text: "是我整合了那些散漫的向导！没有我的向导证，那些外乡人进丛林就是去送死！我是这座城市的英雄！" },

        { speaker: "公诉人", emotion: "公诉人", text: "你所谓的‘幸存’正是本庭最大的疑点。" },
        { speaker: "公诉人", emotion: "公诉人", text: "调查显示，当你奇迹般生还并带回大量财宝时，你没有任何足以证明你通过合法手段获取财富的证据。" },
        { speaker: "公诉人", emotion: "公诉人", text: "尸检报告显示，你的队友死于背后的利刃，而非恐龙之口。你通过谋杀同伴从而独吞了探险队的成果。" },
        { speaker: "公诉人", emotion: "公诉人", text: "随后，你利用这笔血腥的启动资金建立了向导行会，对所有进入丛林的自由民进行勒索。" },
        { speaker: "公诉人", emotion: "公诉人", text: "这构成了一级抢劫致死及垄断勒索罪。判决建议：死刑。" },

        // --- 瓦康嘎 ---
        { speaker: "瓦康嘎·欧塔姆", emotion: "瓦康嘎", text: "你们在审判智慧。" },
        { speaker: "瓦康嘎·欧塔姆", emotion: "瓦康嘎", text: "那些卷轴是用来对抗死亡诅咒的希望。" },
        { speaker: "瓦康嘎·欧塔姆", emotion: "瓦康嘎", text: "至于竖琴手……他们是自由的斗士，不是间谍。" },
        { speaker: "瓦康嘎·欧塔姆", emotion: "瓦康嘎", text: "如果你把魔法视为罪恶，那你只是在展示你的无知与恐惧。" },

        { speaker: "公诉人", emotion: "公诉人", text: "知识无罪，但不受管制的致命力量即为罪。" },
        { speaker: "公诉人", emotion: "公诉人", text: "你将别墅提供给‘竖琴手同盟’——一个未经登记的境外间谍组织——作为据点。" },
        { speaker: "公诉人", emotion: "公诉人", text: "这构成了危害国家安全罪和间谍同谋罪。" },
        { speaker: "公诉人", emotion: "公诉人", text: "此外，你垄断魔法物品的交易，实际上是在民间非法扩散大规模杀伤性武器。" },
        { speaker: "公诉人", emotion: "公诉人", text: "一个不受政府监管的军火库，是对人民安全的最大威胁。判决建议：死刑。" },

        // --- 艾珂内 ---
        { speaker: "艾珂内·阿法", emotion: "艾珂内", text: "他妈的，你们怎么敢！看看窗外！那些平民手里的盾牌是我造的！" },
        { speaker: "艾珂内·阿法", emotion: "艾珂内", text: "当亡灵大军压境的时候，是我和我的武器保护了他们！" },
        { speaker: "艾珂内·阿法", emotion: "艾珂内", text: "你们这是在挑衅整个楚尔特的战士！" },

        { speaker: "公诉人", emotion: "公诉人", text: "被告艾珂内·阿法，所谓的‘英雄’。" },
        { speaker: "公诉人", emotion: "公诉人", text: "你经营竞技场，组织血腥的非法搏击，通过展示野蛮暴力来麻痹民众，这是教唆暴力。" },
        { speaker: "公诉人", emotion: "公诉人", text: "同时，你垄断了盾牌与武器的销售。" },
        { speaker: "公诉人", emotion: "公诉人", text: "任何私人向平民大规模出售军械的行为，都被视为煽动武装暴乱。" },
        { speaker: "公诉人", emotion: "公诉人", text: "你的勇气，是不稳定的暴力因素。判决建议：死刑。" },

        // --- 绛则 ---
        { speaker: "绛则", emotion: "绛则", text: "你们以为杀了我，叶特凯社就会消失吗？" },
        { speaker: "绛则", emotion: "绛则", text: "我们看着安姆人来了又走，看着巨龙飞过天空。你们也只是过客。楚尔特的血脉，不会断绝。" },
        { speaker: "绛则", emotion: "绛则", text: "铁徽已经发出，审判者终将被审判。" },

        { speaker: "公诉人", emotion: "公诉人", text: "被告绛则，你的威胁已被记录在案。" },
        { speaker: "公诉人", emotion: "公诉人", text: "情报部门已确认你是‘叶特凯社’的高级成员。这是一个习惯于滥用私刑、暗杀异见者的秘密结社。" },
        { speaker: "公诉人", emotion: "公诉人", text: "你利用你的旧皇族血统，试图在阴影中操控这个城市的运作，这构成了煽动颠覆国家政权罪和组织非法地下组织罪。" },
        { speaker: "公诉人", emotion: "公诉人", text: "对于旧时代余孽，法律不予宽容。判决建议：死刑。" },

        // --- 宣判 ---
        { speaker: "旁白", emotion: "", text: "所有指控宣读完毕，大厅内死一般的寂静。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "本庭经过审理认为，被告七人长期以来通过暴力、恐吓、欺诈和非法垄断手段，控制南扎路港，剥削人民，勾结外敌与邪魔。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "你们的辩解充满了对生命的漠视和对特权的傲慢。这正是你们必须被清除的理由。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "以文明与秩序之名，本庭宣判：" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "被告七人，全员罪名成立。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "判处……死刑。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "判决将于明日正午在处刑广场公开执行。所有财产充公，所有与其相关的非法组织即刻解散并由政府接管。" },
        { speaker: "大法官赫尔曼", emotion: "赫尔曼", text: "退庭。" },
        
        // --- 尾声 ---
        { speaker: "旁白", emotion: "", text: "随着法槌最后一次落下，宪兵们涌上前来，粗暴地拖拽着七位亲王离开大厅。" },
        { speaker: "旁白", emotion: "", text: "伊方·塔若阿崩溃大哭，双腿瘫软被拖行在地；婕萨敏嘴角勾起嘲讽的冷笑；" },
        { speaker: "旁白", emotion: "", text: "绛则最后回头看了一眼那空荡荡的金色王座。" },
        { speaker: "旁白", emotion: "", text: "南扎路港的天空依旧蔚蓝，但在那绚烂的阳光下，旧时代已经死了。" }
    ]
};
