(() => {
    const { CELL_TYPES, LEVELS, DEFAULT_CUSTOM, buildDefaultTasks } = window.FlyingChessConfig;

    /** 状态 **/
    let currentLevelKey = "normal";
    let level = structuredClone(LEVELS[currentLevelKey]);
    let isCustom = false;

    const players = [
        { id: "A", pos: level.start, name: "玩家A" },
        { id: "B", pos: level.start, name: "玩家B" },
    ];
    let turnIndex = 0; // 0 -> A, 1 -> B
    let rolling = false;

    /** DOM **/
    const boardEl = document.getElementById("board");
    const rollBtn = document.getElementById("rollBtn");
    const resetBtn = document.getElementById("resetBtn");
    const levelSelect = document.getElementById("levelSelect");
    const diceFaceEl = document.getElementById("diceFace");
    const turnTextEl = document.getElementById("turnText");
    const customPanel = document.getElementById("customPanel");
    const customSizeInput = document.getElementById("customSize");
    const applyCustomSizeBtn = document.getElementById("applyCustomSize");
    const cellTypeSelect = document.getElementById("cellType");
    const cellParamInput = document.getElementById("cellParam");
    const winnerEl = document.getElementById("winner");
    const modalEl = document.getElementById("taskModal");
    const modalContentEl = document.getElementById("taskContent");

    // 自定义编辑与加载任务弹窗 DOM
    const openCustomEditorBtn = document.getElementById("openCustomEditorBtn");
    const openLoadTasksBtn = document.getElementById("openLoadTasksBtn");
    const customEditorModal = document.getElementById("customEditorModal");
    const customEditorSizeInput = document.getElementById("customEditorSize");
    const customTasksListEl = document.getElementById("customTasksList");
    const addOneCellBtn = document.getElementById("addOneCellBtn");
    const cancelCustomEditorBtn = document.getElementById("cancelCustomEditor");
    const confirmCustomEditorBtn = document.getElementById("confirmCustomEditor");

    const loadTasksModal = document.getElementById("loadTasksModal");
    const tasksFileSelect = document.getElementById("tasksFileSelect");
    const tasksFilePathInput = document.getElementById("tasksFilePath");
    const loadSizeInput = document.getElementById("loadSizeInput");
    const cancelLoadTasksBtn = document.getElementById("cancelLoadTasks");
    const confirmLoadTasksBtn = document.getElementById("confirmLoadTasks");

    /** 工具 **/
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    function getCellInfo(index) {
        const c = level.cells[index];
        if (!c) return { type: CELL_TYPES.NONE };
        return c;
    }

    function renderBoard() {
        const total = level.size;
        boardEl.innerHTML = "";

        const positions = computeSpiralPositions(total);
        drawOrderPath(positions);

        for (let i = 0; i < total; i++) {
            const info = getCellInfo(i);
            const cell = document.createElement("div");
            const theme = pickTheme(i);
            cell.className = `cell ${theme} ${info.type !== CELL_TYPES.NONE ? info.type : ""}`.trim();
            cell.dataset.index = String(i);
            cell.setAttribute("role", "gridcell");
            cell.setAttribute("aria-label", `${i}`);
            cell.style.left = positions[i].x;
            cell.style.top = positions[i].y;
            cell.title = buildCellTitle(i, info);
            const num = document.createElement("span");
            num.className = "num";
            num.textContent = String(i + 1);
            cell.appendChild(num);

            if (isCustom) {
                cell.addEventListener("click", () => editCell(i));
            }

            boardEl.appendChild(cell);
        }
        renderPieces();
    }

    function drawOrderPath(positions){
        const svg = document.getElementById("boardPath");
        const line = document.getElementById("pathLine");
        if(!svg || !line) return;
        const pts = positions.map(p => `${parseFloat(p.x)},${parseFloat(p.y)}`).join(" ");
        line.setAttribute("points", pts);
    }

    function pickTheme(index){
        const mod = index % 4;
        if(mod===0) return "theme-a";
        if(mod===1) return "theme-b";
        if(mod===2) return "theme-c";
        return "theme-d";
    }

    function buildCellTitle(index, info) {
        switch (info.type) {
            case CELL_TYPES.START: return `起点(${index})`;
            case CELL_TYPES.END: return `终点(${index})`;
            case CELL_TYPES.BOOST: return `前进(${index}) +${info.param}`;
            case CELL_TYPES.BACK: return `后退(${index}) ${info.param}`;
            case CELL_TYPES.SWAP: return `交换(${index})`;
            case CELL_TYPES.JUMP: return `跳转(${index}) -> ${info.param}`;
            case CELL_TYPES.SAFE: return `安全(${index})`;
            default: return `${index}`;
        }
    }

    // 矩形环形跑道：外圈一圈→内缩继续，直至填满
    function computeSpiralPositions(total) {
        const positions = new Array(total);
        const side = Math.ceil(Math.sqrt(total));
        const rows = side;
        const cols = side;
        const gap = 0; // 相邻格子贴合
        const cell = 100 / cols;

        // 生成按环展开的网格坐标序列
        let top = 0, left = 0, bottom = rows - 1, right = cols - 1;
        const order = [];
        while (top <= bottom && left <= right && order.length < total) {
            for (let c = left; c <= right && order.length < total; c++) order.push([top, c]);
            for (let r = top + 1; r <= bottom && order.length < total; r++) order.push([r, right]);
            if (top < bottom) {
                for (let c = right - 1; c >= left && order.length < total; c--) order.push([bottom, c]);
            }
            if (left < right) {
                for (let r = bottom - 1; r > top && order.length < total; r--) order.push([r, left]);
            }
            top++; left++; bottom--; right--;
        }

        for (let i = 0; i < Math.min(order.length, total); i++) {
            const [r, c] = order[i];
            const x = c * cell + cell / 2;
            const y = r * cell + cell / 2;
            positions[i] = { x: x.toFixed(2) + "%", y: y.toFixed(2) + "%" };
        }
        return positions;
    }

    function renderPieces() {
        // 清空所有现有棋子
        document.querySelectorAll(".piece").forEach(n => n.remove());

        // 在对应 cell 上添加棋子
        for (const p of players) {
            const cell = boardEl.querySelector(`.cell[data-index='${p.pos}']`);
            if (!cell) continue;
            const el = document.createElement("div");
            el.className = `piece ${p.id.toLowerCase()}`;
            el.title = p.name;
            cell.appendChild(el);
        }

        // 若在同一格，叠放显示
        if (players[0].pos === players[1].pos) {
            const cell = boardEl.querySelector(`.cell[data-index='${players[0].pos}']`);
            if (cell) {
                const duo = document.createElement("div");
                duo.className = "piece duo b";
                cell.appendChild(duo);
            }
        }
    }

    function refreshStatus() {
        if (diceFaceEl) diceFaceEl.textContent = "-";
        winnerEl.classList.add("hidden");
    }

    function resetGame() {
        players[0].pos = level.start;
        players[1].pos = level.start;
        turnIndex = 0;
        rolling = false;
        renderBoard();
        refreshStatus();
    }

    function switchLevel(key) {
        isCustom = key === "custom";
        currentLevelKey = key;
        if (key === "custom") {
            openCustomEditor();
            return;
        }
        if (key === "load") {
            openLoadTasks();
            return;
        } else {
            level = structuredClone(LEVELS[key]);
            level.tasks = buildDefaultTasks(level.size, level.start, level.end);
            customPanel.classList.add("hidden");
        }
        resetGame();
    }

    // 掷骰并执行移动
    function rollDice() {
        if (rolling) return;
        rolling = true;
        const num = 1 + Math.floor(Math.random() * 6);
        diceFaceEl.textContent = String(num);
        moveCurrent(num);
    }

    function moveCurrent(steps) {
        const me = players[turnIndex];
        let next = clamp(me.pos + steps, 0, level.end);
        me.pos = next;
        renderPieces();
        setTimeout(() => applyCellEffect(me), 250);
    }

    function applyCellEffect(player) {
        const info = getCellInfo(player.pos);
        let message = "";
        if (info.type === CELL_TYPES.END) {
            showTaskModal(player.pos);
            announceWinner(player);
            return;
        }
        switch (info.type) {
            case CELL_TYPES.BOOST: {
                const offset = Number(info.param || 0);
                player.pos = clamp(player.pos + offset, 0, level.end);
                message = `${player.name} 前进 ${Math.abs(offset)} 格`;
                break;
            }
            case CELL_TYPES.BACK: {
                const offset = Number(info.param || 0); // 负数
                player.pos = clamp(player.pos + offset, 0, level.end);
                message = `${player.name} 后退 ${Math.abs(offset)} 格`;
                break;
            }
            case CELL_TYPES.SWAP: {
                const other = players[1 - turnIndex];
                const tmp = other.pos;
                other.pos = player.pos;
                player.pos = tmp;
                message = `${player.name} 与 ${other.name} 交换位置`;
                break;
            }
            case CELL_TYPES.JUMP: {
                const target = clamp(Number(info.param || 0), 0, level.end);
                player.pos = target;
                message = `${player.name} 跳转到 ${target} 格`;
                break;
            }
            case CELL_TYPES.SAFE: {
                message = `${player.name} 安全格，原地休整`;
                break;
            }
            default: break;
        }
        renderPieces();
        if (message) {
            pulseCell(player.pos);
        }
        showTaskModal(player.pos);
        endTurn();
    }

    function showTaskModal(index) {
        const modalRoot = document.getElementById("taskModal");
        const content = document.getElementById("taskContent");
        if (!modalRoot || !content) return;
        if (!level.tasks || !Array.isArray(level.tasks)) return;
        const text = level.tasks[index] ?? "任务";
        content.textContent = text;
        modalRoot.classList.remove("hidden");
    }

    function pulseCell(index) {
        const cell = boardEl.querySelector(`.cell[data-index='${index}']`);
        if (!cell) return;
        cell.classList.add("selected");
        setTimeout(() => cell.classList.remove("selected"), 350);
    }

    function endTurn() {
        if (players[turnIndex].pos >= level.end) {
            announceWinner(players[turnIndex]);
            return;
        }
        turnIndex = 1 - turnIndex;
        rolling = false;
        refreshStatus();
    }

    function announceWinner(player) {
        rolling = false;
        winnerEl.textContent = `${player.name} 获胜！`;
        winnerEl.classList.remove("hidden");
    }

    // 自定义编辑
    function editCell(index) {
        const type = cellTypeSelect.value;
        const paramRaw = cellParamInput.value;
        const textRaw = cellTextInput ? cellTextInput.value : "";
        if (type === CELL_TYPES.NONE) {
            delete level.cells[index];
        } else if (type === CELL_TYPES.START) {
            level.start = index;
            level.cells[index] = { type };
        } else if (type === CELL_TYPES.END) {
            level.end = index;
            level.cells[index] = { type };
        } else if (type === CELL_TYPES.BOOST || type === CELL_TYPES.BACK) {
            const offset = Number(paramRaw || (type === CELL_TYPES.BOOST ? 3 : -3));
            level.cells[index] = { type, param: offset };
        } else if (type === CELL_TYPES.JUMP) {
            const target = clamp(Number(paramRaw || 0), 0, level.size - 1);
            level.cells[index] = { type, param: target };
        } else if (type === CELL_TYPES.TASK) {
            level.cells[index] = { type, text: textRaw || "甜蜜任务" };
        } else if (type === CELL_TYPES.SWAP || type === CELL_TYPES.SAFE) {
            level.cells[index] = { type };
        } else {
            level.cells[index] = { type };
        }
        renderBoard();
    }

    function applyCustomSize() {
        const size = clamp(Number(customSizeInput.value || 60), 10, 300);
        level = DEFAULT_CUSTOM(size);
        level.tasks = buildDefaultTasks(level.size, level.start, level.end);
        resetGame();
    }

    /** 事件 **/
    rollBtn.addEventListener("click", rollDice);
    resetBtn.addEventListener("click", resetGame);
    levelSelect.addEventListener("change", (e) => switchLevel(e.target.value));
    applyCustomSizeBtn.addEventListener("click", applyCustomSize);

    // ===== 自定义编辑器 =====
    function openCustomEditor() {
        const initSize = 30;
        renderCustomEditorList(initSize, []);
        customEditorSizeInput.value = String(initSize);
        customEditorModal.classList.remove("hidden");
    }

    function renderCustomEditorList(size, existing) {
        const maxSize = 80;
        const safeSize = clamp(size, 3, maxSize);
        customTasksListEl.innerHTML = "";
        // 生成输入列表（0..size-1），起点/终点禁用并展示提示
        for (let i = 0; i < safeSize; i++) {
            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "8px";
            row.style.marginBottom = "6px";

            const label = document.createElement("div");
            label.style.width = "56px";
            label.style.opacity = ".85";
            label.textContent = `格${i}`;

            const input = document.createElement("input");
            input.type = "text";
            input.style.flex = "1";
            input.placeholder = (i === 0) ? "开始(自动)" : (i === safeSize - 1) ? "结束(自动)" : "填写任务内容";
            input.value = existing[i] || "";
            if (i === 0 || i === safeSize - 1) {
                input.disabled = true;
            }
            input.dataset.index = String(i);

            row.appendChild(label);
            row.appendChild(input);
            customTasksListEl.appendChild(row);
        }
    }

    addOneCellBtn?.addEventListener("click", () => {
        const currentSize = clamp(Number(customEditorSizeInput.value || 30), 3, 80);
        if (currentSize >= 80) return;
        const values = getCustomEditorValues();
        renderCustomEditorList(currentSize + 1, values);
        customEditorSizeInput.value = String(currentSize + 1);
    });

    customEditorSizeInput?.addEventListener("change", () => {
        const newSize = clamp(Number(customEditorSizeInput.value || 30), 3, 80);
        const values = getCustomEditorValues();
        renderCustomEditorList(newSize, values);
        customEditorSizeInput.value = String(newSize);
    });

    function getCustomEditorValues() {
        const inputs = customTasksListEl.querySelectorAll("input[type='text']");
        const map = {};
        inputs.forEach((inp) => {
            const idx = Number(inp.dataset.index || 0);
            map[idx] = inp.value || "";
        });
        return map;
    }

    cancelCustomEditorBtn?.addEventListener("click", () => {
        customEditorModal.classList.add("hidden");
    });

    confirmCustomEditorBtn?.addEventListener("click", () => {
        const size = clamp(Number(customEditorSizeInput.value || 30), 3, 80);
        // 生成 level：特殊格子套用 hard 模式（截断到 end）
        const base = DEFAULT_CUSTOM(size);
        base.cells = copyHardSpecialsCropped(size);
        // 读取任务，填充并写入“开始/结束”
        const values = getCustomEditorValues();
        const tasks = new Array(size).fill("");
        for (let i = 0; i < size; i++) {
            if (i === 0) { tasks[i] = "开始"; continue; }
            if (i === size - 1) { tasks[i] = "结束"; continue; }
            tasks[i] = values[i] || "";
        }
        base.tasks = tasks;
        // 应用
        isCustom = true;
        currentLevelKey = "custom";
        level = base;
        customEditorModal.classList.add("hidden");
        resetGame();
    });

    function copyHardSpecialsCropped(size) {
        const hard = LEVELS.hard;
        const end = size - 1;
        const out = {};
        out[0] = { type: CELL_TYPES.START };
        out[end] = { type: CELL_TYPES.END };
        for (const k of Object.keys(hard.cells)) {
            const idx = Number(k);
            if (idx > 0 && idx < size - 1) {
                const spec = hard.cells[k];
                // 跳转目标需要裁剪至范围内
                if (spec.type === CELL_TYPES.JUMP) {
                    out[idx] = { type: spec.type, param: clamp(spec.param, 0, end) };
                } else if (spec.type === CELL_TYPES.BACK || spec.type === CELL_TYPES.BOOST) {
                    out[idx] = { type: spec.type, param: spec.param };
                } else {
                    out[idx] = { type: spec.type };
                }
            }
        }
        return out;
    }

    // ===== 从文件加载任务池 =====
    function openLoadTasks() {
        loadSizeInput.value = "40";
        tasksFilePathInput.value = "";
        loadTasksModal.classList.remove("hidden");
    }

    openCustomEditorBtn?.addEventListener("click", openCustomEditor);
    openLoadTasksBtn?.addEventListener("click", openLoadTasks);

    cancelLoadTasksBtn?.addEventListener("click", () => {
        loadTasksModal.classList.add("hidden");
    });

    confirmLoadTasksBtn?.addEventListener("click", async () => {
        const size = clamp(Number(loadSizeInput.value || 40), 3, 80);
        let path = (tasksFilePathInput.value || "").trim();
        if (!path) path = tasksFileSelect.value;
        try {
            const res = await fetch(path, { cache: "no-store" });
            if (!res.ok) throw new Error("加载失败");
            const pool = await res.json();
            if (!Array.isArray(pool) || pool.length === 0) throw new Error("文件格式错误");
            const levelNew = DEFAULT_CUSTOM(size);
            levelNew.cells = copyHardSpecialsCropped(size);
            // 随机起点循环分配
            const tasks = new Array(size).fill("");
            const startIdx = Math.floor(Math.random() * pool.length);
            for (let i = 0, j = startIdx; i < size; i++) {
                if (i === 0) { tasks[i] = "开始"; continue; }
                if (i === size - 1) { tasks[i] = "结束"; continue; }
                tasks[i] = String(pool[j % pool.length] || "");
                j++;
            }
            levelNew.tasks = tasks;
            isCustom = true;
            currentLevelKey = "custom";
            level = levelNew;
            loadTasksModal.classList.add("hidden");
            resetGame();
        } catch (err) {
            alert("加载任务文件失败，请检查路径与内容");
        }
    });

    // 初始化
    switchLevel("normal");
    // 关闭任务弹窗：点空白处
    const modalRoot = document.getElementById("taskModal");
    modalRoot && modalRoot.addEventListener("click", (e) => {
        const target = e.target;
        if (target && target.getAttribute && target.getAttribute("data-close") === "1") {
            modalRoot.classList.add("hidden");
        }
    });

    // 关闭其它两个弹窗
    const closeOnBackdrop = (root) => {
        root && root.addEventListener("click", (e) => {
            const t = e.target;
            if (t && t.getAttribute && t.getAttribute("data-close") === "1") {
                root.classList.add("hidden");
            }
        });
    };
    closeOnBackdrop(document.getElementById("customEditorModal"));
    closeOnBackdrop(document.getElementById("loadTasksModal"));
})();


