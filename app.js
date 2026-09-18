/**
 * ============================================================================
 * CRITICAL TASK DAEMON - APPLICATION ENGINE
 * High-Fidelity Busy Simulation & Anti-Sleep Screen Daemon
 * Pure Vanilla JavaScript, Zero External Dependencies, Offline-First
 * ============================================================================
 */

(function () {
  'use strict';

  // --------------------------------------------------------------------------
  // 全局状态管理
  // --------------------------------------------------------------------------
  const state = {
    currentMode: 'llm',     // 'llm' | 'devops' | 'cyber' | 'quant'
    isBossMode: false,      // 老板键伪装模式
    speed: 1,               // 1 | 2 | 5
    soundEnabled: false,    // 音效
    isPinned: false,        // 顶栏固定
    isFullscreen: false,
    startTime: Date.now(),
    wakeLock: null,
    audioCtx: null,

    // 模式 1: LLM 数据
    llm: {
      step: 18452,
      maxSteps: 60000,
      loss: 1.4820,
      evalPpl: 6.84,
      throughput: 24850,
      lossHistory: [],
      evalHistory: [],
      autoScroll: true
    },

    // 模式 2: DevOps 数据
    devops: {
      testsDone: 3982,
      testsTotal: 4120,
      autoScroll: true
    },

    // 模式 3: Cyber 数据
    cyber: {
      radarAngle: 0,
      targets: [],
      autoScroll: true
    },

    // 模式 4: Quant 数据
    quant: {
      price: 68421.50,
      candles: [],
      autoScroll: true
    },

    // 模式 5: 真实微软 Word / Office 365 状态
    word: {
      wordCount: 3842,
      isManualPaused: false, // 一键手动暂停/继续
      isUserInteracting: false,
      userIdleTimeout: null,
      corpusIndex: 0,
      charIndex: 0,
      currentParagraphCharCount: 0,
      charsSinceLastSave: 0,
      typoState: null
    },

    // 模式 6: OpenAI o1-preview 深度思考模型
    chatgpt: {
      thinkingSeconds: 46,
      stepIndex: 0,
      charIndex: 0,
      isCollapsed: false,
      cotItems: []
    }
  };

  // --------------------------------------------------------------------------
  // DOM 元素缓存
  // --------------------------------------------------------------------------
  const DOM = {
    controlBar: document.getElementById('control-bar'),
    wakeStatus: document.getElementById('wake-status'),
    uptimeDisplay: document.getElementById('uptime-display'),
    modeBtns: document.querySelectorAll('.mode-btn'),
    speedBtn: document.getElementById('speed-btn'),
    soundBtn: document.getElementById('sound-btn'),
    soundOffIcon: document.getElementById('sound-off-icon'),
    soundOnIcon: document.getElementById('sound-on-icon'),
    pinBtn: document.getElementById('pin-btn'),
    bossBtn: document.getElementById('boss-btn'),
    bossExitBtn: document.getElementById('boss-exit-btn'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    enterFsIcon: document.getElementById('enter-fs-icon'),
    exitFsIcon: document.getElementById('exit-fs-icon'),
    exitBtn: document.getElementById('exit-btn'),
    toast: document.getElementById('toast'),

    geekContainer: document.getElementById('geek-container'),
    bossContainer: document.getElementById('boss-container'),

    // 模式容器
    panelLlm: document.getElementById('panel-llm'),
    panelDevops: document.getElementById('panel-devops'),
    panelCyber: document.getElementById('panel-cyber'),
    panelQuant: document.getElementById('panel-quant'),
    panelWord: document.getElementById('panel-word'),
    panelChatgpt: document.getElementById('panel-chatgpt'),

    // Word 组件
    wordDocTitleText: document.getElementById('word-doc-title-text'),
    wordTopSaveStatus: document.getElementById('word-top-save-status'),
    wordWorkspace: document.getElementById('word-workspace'),
    wordPageContainer: document.getElementById('word-page-container'),
    wordTypingPara: document.getElementById('word-typing-para'),
    wordTypedText: document.getElementById('word-typed-text'),
    wordBlinkingCursor: document.getElementById('word-blinking-cursor'),
    wordWordCount: document.getElementById('word-word-count'),
    wordBottomSaveStatus: document.getElementById('word-bottom-save-status'),
    wordPageCount: document.getElementById('word-page-count'),
    wordPauseBtn: document.getElementById('word-pause-btn'),
    wptIcon: document.getElementById('wpt-icon'),
    wptText: document.getElementById('wpt-text'),
    wordTypingStateBadge: document.getElementById('word-typing-state-badge'),
    wtStatusLabel: document.getElementById('wt-status-label'),

    // ChatGPT 组件
    chatgptThoughtBox: document.getElementById('chatgpt-thought-box'),
    chatgptThoughtToggle: document.getElementById('chatgpt-thought-toggle'),
    chatgptThinkingTimerText: document.getElementById('chatgpt-thinking-timer-text'),
    chatgptCotStream: document.getElementById('chatgpt-cot-stream'),
    chatgptCotLiveLabel: document.getElementById('chatgpt-cot-live-label'),
    chatgptScrollContainer: document.getElementById('chatgpt-scroll-container'),

    // LLM 组件
    gpuGrid: document.getElementById('gpu-grid'),
    mThroughput: document.getElementById('m-throughput'),
    mLoss: document.getElementById('m-loss'),
    mStepCounter: document.getElementById('llm-step-counter'),
    lossCanvas: document.getElementById('loss-canvas'),
    logStreamLlm: document.getElementById('log-stream-llm'),
    scrollStateLlm: document.getElementById('scroll-state-llm'),

    // DevOps 组件
    testCounterText: document.getElementById('test-counter-text'),
    testProgressFill: document.getElementById('test-progress-fill'),
    k8sPodList: document.getElementById('k8s-pod-list'),
    testDotsGrid: document.getElementById('test-dots-grid'),
    logStreamDevops: document.getElementById('log-stream-devops'),
    scrollStateDevops: document.getElementById('scroll-state-devops'),

    // Cyber 组件
    radarCanvas: document.getElementById('radar-canvas'),
    radarAzimuth: document.getElementById('radar-azimuth'),
    radarTargets: document.getElementById('radar-targets'),
    hexDumpStream: document.getElementById('hex-dump-stream'),
    logStreamCyber: document.getElementById('log-stream-cyber'),
    scrollStateCyber: document.getElementById('scroll-state-cyber'),

    // Quant 组件
    quantCurPrice: document.getElementById('quant-cur-price'),
    quantCurChange: document.getElementById('quant-cur-change'),
    klineCanvas: document.getElementById('kline-canvas'),
    obAsks: document.getElementById('ob-asks'),
    obBids: document.getElementById('ob-bids'),
    obMidVal: document.getElementById('ob-mid-val'),
    logStreamQuant: document.getElementById('log-stream-quant'),
    scrollStateQuant: document.getElementById('scroll-state-quant'),

    // 老板键图表
    bossChartCanvas: document.getElementById('boss-chart-canvas')
  };

  // --------------------------------------------------------------------------
  // 1. 原生屏幕防休眠 (Screen Wake Lock API) + 保活心跳
  // --------------------------------------------------------------------------
  async function initWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        state.wakeLock = await navigator.wakeLock.request('screen');
        updateWakeStatus(true);
        state.wakeLock.addEventListener('release', () => {
          updateWakeStatus(false);
          // 若意外释放，稍后自动重新请求
          setTimeout(initWakeLock, 3000);
        });
      } catch (err) {
        console.warn('Screen WakeLock error:', err);
        updateWakeStatus(true, 'ACTIVE (FALLBACK)');
      }
    } else {
      updateWakeStatus(true, 'DAEMON ACTIVE');
    }
  }

  function updateWakeStatus(active, text) {
    if (DOM.wakeStatus) {
      const textSpan = DOM.wakeStatus.querySelector('.wake-text');
      if (textSpan) {
        textSpan.textContent = text || (active ? 'AWAKE: ACTIVE' : 'AWAKE: RETRYING');
      }
      DOM.wakeStatus.style.opacity = active ? '1' : '0.6';
    }
  }

  // 页面切回前台时重新获得 WakeLock
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      initWakeLock();
    }
  });

  // 与 Python 后端心跳与内存检测 (/api/status)
  async function pollBackendStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.mem_used_pct && DOM.gpuGrid) {
          // 将部分真实系统内存占用映射到节点显示上
        }
      }
    } catch (e) {
      // 离线单网页独立运行时静默降级
    }
  }
  setInterval(pollBackendStatus, 15000);

  // --------------------------------------------------------------------------
  // 2. Web Audio API 极客打字机与蜂鸣合成器 (零外部音频文件)
  // --------------------------------------------------------------------------
  function initAudio() {
    if (!state.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        state.audioCtx = new AudioContext();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  }

  function playTickSound(type = 'click') {
    if (!state.soundEnabled || !state.audioCtx) return;

    try {
      const ctx = state.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'click') {
        // 轻柔的打字机敲击高频短音 (~1600Hz)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400 + Math.random() * 400, now);
        gain.gain.setValueAtTime(0.015, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
        osc.start(now);
        osc.stop(now + 0.025);
      } else if (type === 'beep') {
        // 安全拦截/高频成交短促微鸣
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'wordKey') {
        // 微软 Office 键盘敲击轻触声 (更温润逼真，频率 550Hz ~ 850Hz 随机变化)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(560 + Math.random() * 280, now);
        gain.gain.setValueAtTime(0.022, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
        osc.start(now);
        osc.stop(now + 0.032);
      } else if (type === 'backspace') {
        // 退格键声 (稍低沉微空击感)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(420 + Math.random() * 60, now);
        gain.gain.setValueAtTime(0.018, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.028);
        osc.start(now);
        osc.stop(now + 0.028);
      }
    } catch (err) {
      // 忽略音频播放异常
    }
  }

  // --------------------------------------------------------------------------
  // 3. UI 交互控制与快捷键
  // --------------------------------------------------------------------------
  function setupControlBar() {
    // 模式切换
    DOM.modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetMode = btn.dataset.mode;
        switchMode(targetMode);
      });
    });

    // 速度切换
    DOM.speedBtn.addEventListener('click', () => {
      if (state.speed === 1) {
        state.speed = 2;
        DOM.speedBtn.textContent = '2x FAST';
        DOM.speedBtn.style.color = '#00f0ff';
      } else if (state.speed === 2) {
        state.speed = 5;
        DOM.speedBtn.textContent = '5x HYPER';
        DOM.speedBtn.style.color = '#ff3860';
      } else {
        state.speed = 1;
        DOM.speedBtn.textContent = '1x NORMAL';
        DOM.speedBtn.style.color = '#ffb700';
      }
      showToast(`EXECUTION SPEED: ${state.speed}x`);
    });

    // 声音切换
    DOM.soundBtn.addEventListener('click', () => {
      initAudio();
      state.soundEnabled = !state.soundEnabled;
      if (state.soundEnabled) {
        DOM.soundOffIcon.classList.add('hidden');
        DOM.soundOnIcon.classList.remove('hidden');
        DOM.soundBtn.classList.add('active');
        playTickSound('beep');
        showToast('TERMINAL AUDIO: ENABLED');
      } else {
        DOM.soundOffIcon.classList.remove('hidden');
        DOM.soundOnIcon.classList.add('hidden');
        DOM.soundBtn.classList.remove('active');
        showToast('TERMINAL AUDIO: MUTED');
      }
    });

    // 锁定/自动隐藏顶栏
    DOM.pinBtn.addEventListener('click', () => {
      state.isPinned = !state.isPinned;
      if (state.isPinned) {
        DOM.controlBar.classList.add('pinned');
        DOM.pinBtn.classList.add('active');
        showToast('CONTROL BAR: PINNED ALWAYS VISIBLE');
      } else {
        DOM.controlBar.classList.remove('pinned');
        DOM.pinBtn.classList.remove('active');
        showToast('CONTROL BAR: AUTO-HIDE ACTIVATED');
      }
    });

    // 老板键
    DOM.bossBtn.addEventListener('click', toggleBossMode);
    DOM.bossExitBtn.addEventListener('click', toggleBossMode);

    // 全屏切换
    DOM.fullscreenBtn.addEventListener('click', toggleFullscreen);

    // 退出按钮
    DOM.exitBtn.addEventListener('click', handleExit);

    // 监听键盘快捷键
    window.addEventListener('keydown', (e) => {
      // 1. 全局 Ctrl+P 快捷键：在 Word 模式下随时一键切换暂停/继续打字
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        if (state.currentMode === 'word') {
          e.preventDefault();
          toggleWordTypingPause();
          return;
        }
      }

      // 2. 允许 Alt + 1~6 即使在可编辑区也能强制切换模式
      if (e.altKey && ['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        e.preventDefault();
        const modeMap = { '1': 'llm', '2': 'devops', '3': 'cyber', '4': 'quant', '5': 'word', '6': 'chatgpt' };
        if (modeMap[e.key]) {
          switchMode(modeMap[e.key]);
          return;
        }
      }

      // 如果按下 Escape，且当前焦点在可编辑区，则使其失焦以方便快捷键操作
      if (e.key === 'Escape' && document.activeElement && document.activeElement.isContentEditable) {
        document.activeElement.blur();
        return;
      }

      // 忽略在输入框、文本域或 contenteditable 可编辑正文中的常规按键输入
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable || e.target.closest('[contenteditable="true"]')) {
        return;
      }

      // Word 模式下单键 X 或 T 一键暂停/恢复打字 (未聚焦文本时)
      if (state.currentMode === 'word' && (e.key === 'x' || e.key === 'X' || e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        toggleWordTypingPause();
        return;
      }

      // 空格键或 B 键触发/退出老板键
      if (e.code === 'Space' || e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        toggleBossMode();
        return;
      }

      // F11 切换全屏
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      // ESC 键退出老板键或全屏
      if (e.key === 'Escape') {
        if (state.isBossMode) {
          toggleBossMode();
          return;
        }
        if (document.fullscreenElement) {
          document.exitFullscreen();
          return;
        }
      }

      // 老板键模式下不响应任务快捷键
      if (state.isBossMode) return;

      // 数字键 1/2/3/4/5/6 切换 6 大任务模式 (支持主键盘数字与小键盘数字)
      if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') {
        e.preventDefault();
        switchMode('llm');
      } else if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') {
        e.preventDefault();
        switchMode('devops');
      } else if (e.key === '3' || e.code === 'Digit3' || e.code === 'Numpad3') {
        e.preventDefault();
        switchMode('cyber');
      } else if (e.key === '4' || e.code === 'Digit4' || e.code === 'Numpad4') {
        e.preventDefault();
        switchMode('quant');
      } else if (e.key === '5' || e.code === 'Digit5' || e.code === 'Numpad5') {
        e.preventDefault();
        switchMode('word');
      } else if (e.key === '6' || e.code === 'Digit6' || e.code === 'Numpad6') {
        e.preventDefault();
        switchMode('chatgpt');
      } else if (e.key === 's' || e.key === 'S') {
        // S 键循环调节速度
        e.preventDefault();
        DOM.speedBtn.click();
      } else if (e.key === 'm' || e.key === 'M') {
        // M 键开关音效
        e.preventDefault();
        DOM.soundBtn.click();
      } else if (e.key === 'p' || e.key === 'P') {
        // P 键固定/自动隐藏顶栏
        e.preventDefault();
        DOM.pinBtn.click();
      }
    });

    // 双击空白处切换全屏
    document.addEventListener('dblclick', (e) => {
      if (!e.target.closest('button') && !e.target.closest('input') && !e.target.closest('.control-bar') && !e.target.closest('[contenteditable="true"]')) {
        toggleFullscreen();
      }
    });
  }

  function switchMode(mode) {
    if (state.currentMode === mode) return;
    state.currentMode = mode;

    DOM.modeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    DOM.panelLlm.classList.toggle('active', mode === 'llm');
    DOM.panelDevops.classList.toggle('active', mode === 'devops');
    DOM.panelCyber.classList.toggle('active', mode === 'cyber');
    DOM.panelQuant.classList.toggle('active', mode === 'quant');
    if (DOM.panelWord) {
      DOM.panelWord.classList.toggle('active', mode === 'word');
    }
    if (DOM.panelChatgpt) {
      DOM.panelChatgpt.classList.toggle('active', mode === 'chatgpt');
    }

    const isWord = (mode === 'word');
    const isChatgpt = (mode === 'chatgpt');
    document.body.classList.toggle('mode-word-active', isWord);
    document.body.classList.toggle('mode-chatgpt-active', isChatgpt);

    if (isWord) {
      document.title = '2026年度业务发展规划与数字化组织协同机制实施细则.docx - Word';
      resumeWordTyping();
    } else if (isChatgpt) {
      document.title = 'ChatGPT - 全球分布式强一致性金融撮合引擎架构设计';
      resumeChatgptThinking();
    } else {
      document.title = 'CRITICAL_TASK_DAEMON :: HIGH_LOAD_PROCESSING';
    }

    // 触发布局重绘
    requestAnimationFrame(() => {
      resizeCanvases();
    });

    showToast(`SWITCHED TO: ${mode.toUpperCase()} MODE`);
  }

  function toggleBossMode() {
    state.isBossMode = !state.isBossMode;
    if (state.isBossMode) {
      DOM.bossContainer.classList.remove('hidden');
      DOM.geekContainer.classList.add('hidden');
      DOM.controlBar.classList.add('hidden');
      document.title = '2026年企业 Q3 业务战略复盘与各事业部执行效能追踪报表';
      drawBossChart();
    } else {
      DOM.bossContainer.classList.add('hidden');
      DOM.geekContainer.classList.remove('hidden');
      DOM.controlBar.classList.remove('hidden');
      if (state.currentMode === 'word') {
        document.title = '2026年度业务发展规划与数字化组织协同机制实施细则.docx - Word';
      } else if (state.currentMode === 'chatgpt') {
        document.title = 'ChatGPT - 全球分布式强一致性金融撮合引擎架构设计';
      } else {
        document.title = 'CRITICAL_TASK_DAEMON :: HIGH_LOAD_PROCESSING';
      }
      resizeCanvases();
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        state.isFullscreen = true;
        DOM.enterFsIcon.classList.add('hidden');
        DOM.exitFsIcon.classList.remove('hidden');
        showToast('ENTER FULLSCREEN (Press ESC or F11 to exit)');
      } else {
        await document.exitFullscreen();
        state.isFullscreen = false;
        DOM.enterFsIcon.classList.remove('hidden');
        DOM.exitFsIcon.classList.add('hidden');
      }
    } catch (e) {
      // 忽略全屏被浏览器阻断的情况
    }
  }

  async function handleExit() {
    if (confirm('确定要退出高负荷任务并恢复系统息屏设置吗？')) {
      try {
        await fetch('/api/exit');
      } catch (e) {}
      window.close();
      document.body.innerHTML = `
        <div style="display:flex;height:100vh;align-items:center;justify-content:center;color:#00ff88;font-family:monospace;font-size:18px;background:#05070a;">
          <div>[SYSTEM_SHUTDOWN] Task finished. Wake lock released. Safe to close.</div>
        </div>`;
    }
  }

  function showToast(msg) {
    if (!DOM.toast) return;
    DOM.toast.textContent = msg;
    DOM.toast.classList.remove('hidden');
    clearTimeout(DOM.toast._timer);
    DOM.toast._timer = setTimeout(() => {
      DOM.toast.classList.add('hidden');
    }, 2400);
  }

  // 挂机计时器
  function updateUptime() {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    if (DOM.uptimeDisplay) {
      DOM.uptimeDisplay.textContent = `${hrs}:${mins}:${secs}`;
    }
  }
  setInterval(updateUptime, 1000);

  // --------------------------------------------------------------------------
  // 4. 通用终端日志管理与平滑滚动监听
  // --------------------------------------------------------------------------
  function setupScrollDetection(streamEl, stateBadgeEl, modeKey) {
    streamEl.addEventListener('scroll', () => {
      const isAtBottom = streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight < 35;
      state[modeKey].autoScroll = isAtBottom;
      if (isAtBottom) {
        stateBadgeEl.textContent = 'AUTO-SCROLL';
        stateBadgeEl.classList.remove('paused');
      } else {
        stateBadgeEl.textContent = 'PAUSED';
        stateBadgeEl.classList.add('paused');
      }
    });
  }

  function appendLog(streamEl, htmlContent, modeKey) {
    const p = document.createElement('div');
    p.className = 'log-line';
    p.innerHTML = htmlContent;
    streamEl.appendChild(p);

    // 最多保留 250 行日志防止内存过大
    if (streamEl.children.length > 250) {
      streamEl.removeChild(streamEl.firstElementChild);
    }

    if (state[modeKey].autoScroll) {
      streamEl.scrollTop = streamEl.scrollHeight;
    }

    playTickSound('click');
  }

  window.copyLogs = function (streamId) {
    const el = document.getElementById(streamId);
    if (!el) return;
    navigator.clipboard.writeText(el.innerText).then(() => {
      showToast('LOGS COPIED TO CLIPBOARD');
    });
  };

  window.clearLogs = function (streamId) {
    const el = document.getElementById(streamId);
    if (!el) return;
    el.innerHTML = '';
    showToast('LOG CONSOLE CLEARED');
  };

  // --------------------------------------------------------------------------
  // 5. 模式 1: 大模型预训练 (LLM PRETRAINING) 引擎
  // --------------------------------------------------------------------------
  function initLlmGpuGrid() {
    if (!DOM.gpuGrid) return;
    DOM.gpuGrid.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const box = document.createElement('div');
      box.className = 'gpu-box';
      box.id = `gpu-node-${i}`;
      box.innerHTML = `
        <div class="gpu-head">
          <span>GPU #${i} [H100]</span>
          <span class="gpu-temp" id="gpu-temp-${i}">78°C</span>
        </div>
        <div class="gpu-stat-line">
          <span>VRAM: <strong id="gpu-vram-${i}">76.8</strong>/80 GB</span>
          <span id="gpu-util-${i}">98%</span>
        </div>
        <div class="gpu-bar-wrap">
          <div class="gpu-bar-fill" id="gpu-bar-${i}" style="width: 96%;"></div>
        </div>
        <div class="gpu-foot">
          <span>PWR: <strong id="gpu-pwr-${i}">382W</strong></span>
          <span>NVLink: 892GB/s</span>
        </div>
      `;
      DOM.gpuGrid.appendChild(box);
    }
  }

  function updateLlmMetrics() {
    if (state.currentMode !== 'llm') return;

    // 步数递增
    state.llm.step += state.speed;
    const pct = ((state.llm.step / state.llm.maxSteps) * 100).toFixed(1);
    if (DOM.mStepCounter) {
      DOM.mStepCounter.textContent = `STEP: ${state.llm.step.toLocaleString()} / ${state.llm.maxSteps.toLocaleString()} (${pct}%)`;
    }

    // Loss 衰减更新
    const stepRatio = state.llm.step / state.llm.maxSteps;
    // 逼真指数下降 + 高频微抖动
    const baseLoss = 1.48 * Math.exp(-stepRatio * 0.4) + 0.12;
    const noise = (Math.random() - 0.5) * 0.0035;
    state.llm.loss = parseFloat((baseLoss + noise).toFixed(4));
    if (DOM.mLoss) DOM.mLoss.textContent = state.llm.loss.toFixed(4);

    // Throughput 波动
    const tput = 24800 + Math.floor(Math.random() * 450);
    if (DOM.mThroughput) DOM.mThroughput.textContent = tput.toLocaleString();

    // 记录历史供折线图绘制
    state.llm.lossHistory.push(state.llm.loss);
    if (state.llm.lossHistory.length > 90) state.llm.lossHistory.shift();

    if (state.llm.step % 12 === 0) {
      state.llm.evalPpl = parseFloat((state.llm.loss * 4.62 + (Math.random() - 0.5) * 0.04).toFixed(3));
      state.llm.evalHistory.push(state.llm.evalPpl);
      if (state.llm.evalHistory.length > 90) state.llm.evalHistory.shift();
    }

    // 8张 GPU 微扰动
    for (let i = 0; i < 8; i++) {
      const tempEl = document.getElementById(`gpu-temp-${i}`);
      const vramEl = document.getElementById(`gpu-vram-${i}`);
      const utilEl = document.getElementById(`gpu-util-${i}`);
      const barEl = document.getElementById(`gpu-bar-${i}`);
      const pwrEl = document.getElementById(`gpu-pwr-${i}`);

      if (tempEl) {
        const temp = 77 + Math.floor(Math.random() * 4);
        tempEl.textContent = `${temp}°C`;
        const vram = (76.2 + Math.random() * 0.9).toFixed(1);
        vramEl.textContent = vram;
        const util = 97 + Math.floor(Math.random() * 4);
        utilEl.textContent = `${util}%`;
        barEl.style.width = `${util}%`;
        const pwr = 378 + Math.floor(Math.random() * 15);
        pwrEl.textContent = `${pwr}W`;
      }
    }

    drawLossChart();
  }

  function drawLossChart() {
    const canvas = DOM.lossCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 绘制坐标网格
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 45) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const data = state.llm.lossHistory;
    if (data.length < 2) return;

    const minVal = Math.min(...data) * 0.98;
    const maxVal = Math.max(...data) * 1.02;
    const range = maxVal - minVal || 1;

    // 绘制渐变面积与 Loss 曲线
    ctx.beginPath();
    const stepX = w / (data.length - 1);

    for (let i = 0; i < data.length; i++) {
      const x = i * stepX;
      const y = h - ((data[i] - minVal) / range) * (h - 20) - 10;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // 描边发光
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 绘制闭合渐变
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.25)');
    grad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // 绘制最新点的圆圈发光指示
    const lastX = (data.length - 1) * stepX;
    const lastY = h - ((data[data.length - 1] - minVal) / range) * (h - 20) - 10;
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // LLM 日志模板
  const llmLogTemplates = [
    () => `[INFO] rank 0: step=${state.llm.step}, loss=${state.llm.loss.toFixed(4)}, lr=2.45e-05, grad_norm=0.842, throughput=${state.llm.throughput} tok/s, fwd_time=13.8ms, bwd_time=27.4ms`,
    () => `[TENSOR] ZeRO-3: partitioned optimizer states successfully synchronized across 8 ranks via NCCL Ring (800 Gbps)`,
    () => `[INFO] FlashAttention-2 forward kernel: kv_cache hit 100%, sequence_length=8192, causal=True, mfu=64.2%`,
    () => `[CHECKPOINT] Saving shard checkpoint-${state.llm.step} to /mnt/nvme/llama3-70b-ckpt/ (IO 4.28 GB/s)`,
    () => `[EVAL] Validation slice perplexity: ${state.llm.evalPpl} (eval_loss: ${(state.llm.loss * 1.15).toFixed(4)}, token_acc: 78.9%)`,
    () => `[CUDA] All-Reduce collective completed in 1.14ms. Gradient clipping norm 0.842 <= max 1.000`,
    () => `[BATCH] Processed 2,048 sequences (16,777,216 tokens) | Zero NaN/Inf anomalies detected`,
    () => `[OFFLOAD] NVMe prefetch pipeline active: layer 56 weights staged in VRAM before backward call`
  ];

  function pushLlmLog() {
    if (state.currentMode !== 'llm') return;
    const tmpl = llmLogTemplates[Math.floor(Math.random() * llmLogTemplates.length)];
    const timeStr = new Date().toTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
    let line = tmpl();
    line = line.replace(/\[INFO\]/, '<span class="log-info">[INFO]</span>')
               .replace(/\[TENSOR\]/, '<span class="log-tensor">[TENSOR]</span>')
               .replace(/\[CHECKPOINT\]/, '<span class="log-warn">[CHECKPOINT]</span>')
               .replace(/\[EVAL\]/, '<span class="log-success">[EVAL]</span>')
               .replace(/\[CUDA\]/, '<span class="log-cyan">[CUDA]</span>');
    appendLog(DOM.logStreamLlm, `<span class="log-time">${timeStr}</span> ${line}`, 'llm');
  }

  // --------------------------------------------------------------------------
  // 6. 模式 2: DevOps CI/CD 流水线引擎
  // --------------------------------------------------------------------------
  function initDevopsK8sGrid() {
    if (!DOM.k8sPodList || !DOM.testDotsGrid) return;

    // 动态填充 4 个高核心 Pod
    const pods = [
      { name: 'gateway-ingress-prod-84f9b-1', ready: '3/3', cpu: '840m', mem: '1.2Gi' },
      { name: 'auth-jwt-core-79d8a-4', ready: '2/2', cpu: '410m', mem: '680Mi' },
      { name: 'order-settlement-engine-31c4f-9', ready: '4/4', cpu: '1620m', mem: '2.8Gi' },
      { name: 'vector-db-raft-cluster-02b-1', ready: '3/3', cpu: '980m', mem: '3.4Gi' }
    ];
    DOM.k8sPodList.innerHTML = pods.map(p => `
      <div class="k8s-pod-row">
        <span class="pod-name">${p.name}</span>
        <span>Ready: ${p.ready}</span>
        <span>CPU: ${p.cpu}</span>
        <span>Mem: ${p.mem}</span>
        <span class="pod-status running">● RUNNING</span>
      </div>
    `).join('');

    // 动态生成 80 个测试点
    DOM.testDotsGrid.innerHTML = '';
    for (let i = 0; i < 80; i++) {
      const dot = document.createElement('div');
      dot.className = 'test-dot';
      dot.id = `test-dot-${i}`;
      DOM.testDotsGrid.appendChild(dot);
    }
  }

  function updateDevopsState() {
    if (state.currentMode !== 'devops') return;

    // 测试数递增
    if (state.devops.testsDone < state.devops.testsTotal) {
      state.devops.testsDone = Math.min(state.devops.testsTotal, state.devops.testsDone + 3 * state.speed);
      const pct = Math.round((state.devops.testsDone / state.devops.testsTotal) * 100);
      if (DOM.testCounterText) {
        DOM.testCounterText.textContent = `Running 128 parallel test threads... (${state.devops.testsDone.toLocaleString()}/${state.devops.testsTotal.toLocaleString()})`;
      }
      if (DOM.testProgressFill) {
        DOM.testProgressFill.style.width = `${pct}%`;
      }
    } else {
      state.devops.testsDone = 3800; // 循环模拟
    }

    // 随机几颗测试微点闪烁
    for (let k = 0; k < 4; k++) {
      const idx = Math.floor(Math.random() * 80);
      const dot = document.getElementById(`test-dot-${idx}`);
      if (dot) {
        dot.classList.add('running');
        setTimeout(() => dot.classList.remove('running'), 400);
      }
    }
  }

  const devopsLogTemplates = [
    () => `[CARGO] Compiling tokio-uring v0.4.2 (x86_64-unknown-linux-gnu release)`,
    () => `[DOCKER] Stage 3/5 [build-artifacts]: RUN npm run build -- --mode=production (took 14.2s)`,
    () => `[TEST] test security::rbac::test_jwt_signature_validation ... ok (0.002s)`,
    () => `[TEST] test high_throughput::ring_buffer::bench_spsc_queue ... ok (0.014s)`,
    () => `[K8S] Deploying Canary replicaSet: core-engine-prod-v2.14.0 (Rollout 30% traffic)`,
    () => `[COSIGN] Image digest verified with KMS Key ARN arn:aws:kms:eu-central-1:89420:key/prod-sign`,
    () => `[TERRAFORM] aws_route53_record.primary_traffic: Plan 0 to add, 1 to change, 0 to destroy`,
    () => `[HELM] Release "core-mesh" updated successfully. STATUS: deployed REVISION: 142`
  ];

  function pushDevopsLog() {
    if (state.currentMode !== 'devops') return;
    const tmpl = devopsLogTemplates[Math.floor(Math.random() * devopsLogTemplates.length)];
    const timeStr = new Date().toTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
    let line = tmpl();
    line = line.replace(/\[CARGO\]/, '<span class="log-cyan">[CARGO]</span>')
               .replace(/\[DOCKER\]/, '<span class="log-info">[DOCKER]</span>')
               .replace(/\[TEST\]/, '<span class="log-success">[TEST]</span>')
               .replace(/\[K8S\]/, '<span class="log-warn">[K8S]</span>')
               .replace(/\[COSIGN\]/, '<span class="log-tensor">[COSIGN]</span>');
    appendLog(DOM.logStreamDevops, `<span class="log-time">${timeStr}</span> ${line}`, 'devops');
  }

  // --------------------------------------------------------------------------
  // 7. 模式 3: 全球网络安全攻防与态势感知 (CYBER DEFENSE)
  // --------------------------------------------------------------------------
  function initCyberRadar() {
    // 预置 12 个随机目标
    state.cyber.targets = [];
    for (let i = 0; i < 12; i++) {
      state.cyber.targets.push({
        angle: Math.random() * Math.PI * 2,
        dist: 0.2 + Math.random() * 0.75,
        alpha: 0.2 + Math.random() * 0.8,
        pulse: Math.random() * 0.05
      });
    }
  }

  function drawRadar() {
    if (state.currentMode !== 'cyber') return;
    const canvas = DOM.radarCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(cx, cy) - 15;

    ctx.clearRect(0, 0, w, h);

    // 旋转扫描角
    state.cyber.radarAngle = (state.cyber.radarAngle + 0.03 * state.speed) % (Math.PI * 2);
    const deg = ((state.cyber.radarAngle * 180) / Math.PI).toFixed(1);
    if (DOM.radarAzimuth) DOM.radarAzimuth.textContent = `${deg}°`;

    // 绘制同心圆
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1.0].forEach(rRatio => {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * rRatio, 0, Math.PI * 2);
      ctx.stroke();
    });

    // 绘制经纬十字准线
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    // 绘制旋转扇形扫描余辉 (Gradient)
    const sweepAngle = Math.PI / 4;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.3)');
    grad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, maxR, state.cyber.radarAngle - sweepAngle, state.cyber.radarAngle);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.fill();
    ctx.restore();

    // 扫描主体光线
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(state.cyber.radarAngle) * maxR, cy + Math.sin(state.cyber.radarAngle) * maxR);
    ctx.stroke();

    // 绘制威胁目标点
    state.cyber.targets.forEach(t => {
      const tx = cx + Math.cos(t.angle) * (t.dist * maxR);
      const ty = cy + Math.sin(t.angle) * (t.dist * maxR);

      // 计算与扫描线角度差
      let diff = Math.abs(state.cyber.radarAngle - t.angle);
      if (diff > Math.PI) diff = Math.PI * 2 - diff;

      const isScanned = diff < 0.2;
      ctx.fillStyle = isScanned ? '#ff3860' : 'rgba(255, 56, 96, 0.4)';
      ctx.beginPath();
      ctx.arc(tx, ty, isScanned ? 4.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();

      if (isScanned) {
        ctx.strokeStyle = '#ff3860';
        ctx.strokeRect(tx - 6, ty - 6, 12, 12);
      }
    });
  }

  function updateHexDump() {
    if (state.currentMode !== 'cyber' || !DOM.hexDumpStream) return;
    const randomHex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
    const addr = '0x7FFF' + Math.floor(1000 + Math.random() * 8999).toString(16).toUpperCase();

    const bytes = [];
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      const b = randomHex();
      bytes.push(b);
      const code = parseInt(b, 16);
      ascii += (code >= 32 && code <= 126) ? String.fromCharCode(code) : '.';
    }

    const row = document.createElement('div');
    row.className = 'hex-row';
    row.innerHTML = `
      <span class="hex-addr">${addr}</span>
      <span class="hex-bytes">${bytes.join(' ')}</span>
      <span class="hex-ascii">| ${ascii} |</span>
    `;
    DOM.hexDumpStream.appendChild(row);
    if (DOM.hexDumpStream.children.length > 8) {
      DOM.hexDumpStream.removeChild(DOM.hexDumpStream.firstElementChild);
    }
  }

  const cyberLogTemplates = [
    () => `[SURICATA] ET EXPLOIT HTTP Spring4Shell (CVE-2022-22965) blocked from 194.26.29.112:54820 -> :8080 [DROP]`,
    () => `[eBPF-XDP] SYN Flood rate-limit exceeded: 2,420,000 pps discarded via kernel bypass NIC`,
    () => `[HONEYPOT] SSH BruteForce dictionary attack mitigated from 85.203.44.18 (user: root, keys: 42)`,
    () => `[WAF] SQLi Attempt in Cookie 'session_token' blocked (Payload: ' UNION SELECT 1,schema_name FROM information_schema)`,
    () => `[TLS-INSPECT] MitM fingerprinting JA3 matched malicious botnet "Mirai.v4" signature - Connection reset`,
    () => `[SIEM] Zero-Day vulnerability heuristic score 0.942 on URI /api/v1/debug/heapdump [ISOLATED]`
  ];

  function pushCyberLog() {
    if (state.currentMode !== 'cyber') return;
    const tmpl = cyberLogTemplates[Math.floor(Math.random() * cyberLogTemplates.length)];
    const timeStr = new Date().toTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
    let line = tmpl();
    line = line.replace(/\[SURICATA\]/, '<span class="log-error">[SURICATA]</span>')
               .replace(/\[eBPF-XDP\]/, '<span class="log-warn">[eBPF-XDP]</span>')
               .replace(/\[HONEYPOT\]/, '<span class="log-cyan">[HONEYPOT]</span>')
               .replace(/\[WAF\]/, '<span class="log-error">[WAF]</span>')
               .replace(/\[SIEM\]/, '<span class="log-tensor">[SIEM]</span>');
    appendLog(DOM.logStreamCyber, `<span class="log-time">${timeStr}</span> ${line}`, 'cyber');
  }

  // --------------------------------------------------------------------------
  // 8. 模式 4: 高频量化交易算法与撮合回测 (QUANT ALGO)
  // --------------------------------------------------------------------------
  function initKlineData() {
    let p = 68200.0;
    state.quant.candles = [];
    for (let i = 0; i < 40; i++) {
      const open = p;
      const change = (Math.random() - 0.48) * 60;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 25;
      const low = Math.min(open, close) - Math.random() * 25;
      const vol = Math.floor(40 + Math.random() * 120);
      state.quant.candles.push({ open, high, low, close, vol });
      p = close;
    }
    state.quant.price = p;
  }

  function updateQuantTick() {
    if (state.currentMode !== 'quant') return;

    // 价格微步跳变
    const delta = (Math.random() - 0.48) * 12 * state.speed;
    state.quant.price = parseFloat((state.quant.price + delta).toFixed(2));
    if (DOM.quantCurPrice) {
      DOM.quantCurPrice.textContent = `$${state.quant.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    }
    if (DOM.obMidVal) {
      DOM.obMidVal.textContent = `${state.quant.price.toFixed(2)} ↑`;
    }

    // 更新最后一根 Candle
    const lastCandle = state.quant.candles[state.quant.candles.length - 1];
    if (lastCandle) {
      lastCandle.close = state.quant.price;
      lastCandle.high = Math.max(lastCandle.high, state.quant.price);
      lastCandle.low = Math.min(lastCandle.low, state.quant.price);
      lastCandle.vol += Math.floor(Math.random() * 5);
    }

    // 周期性新增一根 K 线
    if (Math.random() < 0.15) {
      state.quant.candles.push({
        open: state.quant.price,
        high: state.quant.price,
        low: state.quant.price,
        close: state.quant.price,
        vol: 10
      });
      if (state.quant.candles.length > 45) {
        state.quant.candles.shift();
      }
    }

    drawKlineChart();
    updateOrderBook();
  }

  function drawKlineChart() {
    const canvas = DOM.klineCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const candles = state.quant.candles;
    if (candles.length === 0) return;

    let minP = Infinity;
    let maxP = -Infinity;
    let maxV = 0;
    candles.forEach(c => {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      if (c.vol > maxV) maxV = c.vol;
    });

    const priceRange = maxP - minP || 1;
    const chartBottom = h - 45; // 留 45px 给成交量柱子

    const barW = Math.max(4, Math.floor((w - 60) / candles.length) - 3);

    // 绘制 K 线实体与上下影线
    candles.forEach((c, idx) => {
      const x = 20 + idx * (barW + 3);
      const isUp = c.close >= c.open;
      const color = isUp ? '#00ff88' : '#ff3860';

      const yHigh = chartBottom - ((c.high - minP) / priceRange) * (chartBottom - 20);
      const yLow = chartBottom - ((c.low - minP) / priceRange) * (chartBottom - 20);
      const yOpen = chartBottom - ((c.open - minP) / priceRange) * (chartBottom - 20);
      const yClose = chartBottom - ((c.close - minP) / priceRange) * (chartBottom - 20);

      // 影线
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + barW / 2, yHigh);
      ctx.lineTo(x + barW / 2, yLow);
      ctx.stroke();

      // 实体
      const entityTop = Math.min(yOpen, yClose);
      const entityHeight = Math.max(2, Math.abs(yClose - yOpen));
      ctx.fillStyle = color;
      ctx.fillRect(x, entityTop, barW, entityHeight);

      // 成交量柱状图
      const vH = (c.vol / maxV) * 35;
      ctx.fillStyle = isUp ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 56, 96, 0.3)';
      ctx.fillRect(x, h - vH, barW, vH);
    });

    // 绘制现价虚线
    const curY = chartBottom - ((state.quant.price - minP) / priceRange) * (chartBottom - 20);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, curY);
    ctx.lineTo(w, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 现价标签
    ctx.fillStyle = '#00f0ff';
    ctx.font = '10px monospace';
    ctx.fillText(`$${state.quant.price.toFixed(2)}`, w - 55, curY - 3);
  }

  function updateOrderBook() {
    if (!DOM.obAsks || !DOM.obBids) return;
    const baseP = state.quant.price;

    // 生成 5 档卖单 (Asks)
    let asksHtml = '';
    for (let i = 5; i >= 1; i--) {
      const askPrice = (baseP + i * 0.4).toFixed(2);
      const amount = (0.35 + Math.random() * 2.8).toFixed(3);
      const total = (amount * askPrice / 1000).toFixed(1) + 'k';
      const depthPct = Math.min(95, Math.floor(Math.random() * 70 + 20));
      asksHtml += `
        <div class="ob-row">
          <div class="ob-depth-bar" style="width: ${depthPct}%;"></div>
          <span class="ob-price">${askPrice}</span>
          <span class="ob-amount">${amount}</span>
          <span class="ob-total">${total}</span>
        </div>
      `;
    }
    DOM.obAsks.innerHTML = asksHtml;

    // 生成 5 档买单 (Bids)
    let bidsHtml = '';
    for (let i = 1; i <= 5; i++) {
      const bidPrice = (baseP - i * 0.4).toFixed(2);
      const amount = (0.42 + Math.random() * 3.1).toFixed(3);
      const total = (amount * bidPrice / 1000).toFixed(1) + 'k';
      const depthPct = Math.min(95, Math.floor(Math.random() * 70 + 20));
      bidsHtml += `
        <div class="ob-row">
          <div class="ob-depth-bar" style="width: ${depthPct}%;"></div>
          <span class="ob-price">${bidPrice}</span>
          <span class="ob-amount">${amount}</span>
          <span class="ob-total">${total}</span>
        </div>
      `;
    }
    DOM.obBids.innerHTML = bidsHtml;
  }

  const quantLogTemplates = [
    () => `[TAPE] BUY  | ${(state.quant.price + 0.1).toFixed(2)} | ${(0.8 + Math.random() * 3.5).toFixed(3)} BTC | CME_MATCHED (42μs)`,
    () => `[TAPE] SELL | ${(state.quant.price - 0.1).toFixed(2)} | ${(0.5 + Math.random() * 2.8).toFixed(3)} BTC | BINANCE_PERP (38μs)`,
    () => `[ALPHA] Stat-Arb Factor 09: Delta-neutral pairs spread divergence +2.18σ, Rebalanced`,
    () => `[ROUTER] FPGA SmartNIC Solarflare: Direct DMA execution latency 8.12 μs (Jitter 0.2μs)`,
    () => `[RISK] Portfolio VaR (99% 1-day): $128,450 / Max drawdown tolerance 2.10% [SAFE]`,
    () => `[MATCH] Iceberg Order sliced: Part 18/50 filled at average $${state.quant.price.toFixed(2)}`
  ];

  function pushQuantLog() {
    if (state.currentMode !== 'quant') return;
    const tmpl = quantLogTemplates[Math.floor(Math.random() * quantLogTemplates.length)];
    const timeStr = new Date().toTimeString().split(' ')[0] + '.' + String(Date.now() % 1000).padStart(3, '0');
    let line = tmpl();
    line = line.replace(/BUY/, '<span class="log-success">BUY </span>')
               .replace(/SELL/, '<span class="log-error">SELL</span>')
               .replace(/\[TAPE\]/, '<span class="log-cyan">[TAPE]</span>')
               .replace(/\[ALPHA\]/, '<span class="log-tensor">[ALPHA]</span>')
               .replace(/\[ROUTER\]/, '<span class="log-warn">[ROUTER]</span>');
    appendLog(DOM.logStreamQuant, `<span class="log-time">${timeStr}</span> ${line}`, 'quant');
  }

  // --------------------------------------------------------------------------
  // 9. 老板键企业图表绘制
  // --------------------------------------------------------------------------
  function drawBossChart() {
    const canvas = DOM.bossChartCanvas;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const months = ['4月', '5月', '6月', '7月', '8月', '9月(当前)', '10月(预测)', '11月(预测)'];
    const actuals = [42, 48, 55, 62, 71, 79];
    const targets = [40, 45, 52, 58, 65, 75, 84, 92];

    const chartH = h - 35;
    const colW = w / months.length;

    // 绘制柱状图 (目标与实际)
    months.forEach((m, i) => {
      const x = i * colW + colW * 0.2;
      const bw = colW * 0.3;

      // 目标柱 (淡蓝)
      const tH = (targets[i] / 100) * (chartH - 20);
      ctx.fillStyle = '#e0e7ff';
      ctx.fillRect(x, chartH - tH, bw, tH);

      // 实际柱 (深蓝)
      if (i < actuals.length) {
        const aH = (actuals[i] / 100) * (chartH - 20);
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(x + bw + 2, chartH - aH, bw, aH);
      }

      // X 轴文字
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m, i * colW + colW * 0.5, h - 8);
    });

    // 绘制折线趋势 (环比增长)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    actuals.forEach((val, i) => {
      const cx = i * colW + colW * 0.5;
      const cy = chartH - (val / 100) * (chartH - 20);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    actuals.forEach((val, i) => {
      const cx = i * colW + colW * 0.5;
      const cy = chartH - (val / 100) * (chartH - 20);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.stroke();
    });
  }

  // --------------------------------------------------------------------------
  // 10. 微软 Word / Office 365 拟真文字处理与打字机引擎
  // --------------------------------------------------------------------------
  const WORD_CORPUS = [
    "针对重点协同任务实施“红黄蓝”三色动态预警；对进度连续两次亮黄灯的专项，由督导推进办直接介入督办会商；",
    "全面打破各事业群之间的数据孤岛与协作壁垒，推动跨业务线底层接口标准化与统一契约治理；",
    "各级业务单元须紧扣“提质增效”战略纲领，按月度对标关键效能产出比，实现全业务链条服务敏捷流转；",
    "强化技术中台对于各前台作战单元的即时算力供给，将复杂模型推理与批量计算任务平均排队时延压降至80毫秒以内；",
    "建立健全容错纠错与先锋激励机制，对在数字化创新攻坚战中作出显著贡献的技术骨干，在年度期权评选与职级晋升中给予专项倾斜；",
    "各事业部应加快推进核心应用容器化编排与微服务解耦，确保系统在重大促销与高并发峰值期具备秒级弹性扩缩容能力；",
    "围绕高净值企业客户全生命周期旅程，统一客户服务中枢，将客户诉求响应与工单闭环处理时效提升至4小时以内；",
    "持续完善海外多可用区基础设施协同与跨域合规治理架构，打造具备全球竞争力的企业级高可用韧性底座；",
    "严格落实网络与数据安全合规第一责任制，全面加强敏感数据分级分类保护与动态访问脱敏审计，严防各类越权与外泄风险；",
    "推动业务流与财务报销、采购供应链及资产管理系统的自动化无缝串联，实现全流程单据在线穿透审批与智能核算；",
    "由人力资源部与技术委员会联合构建复合型数字化人才梯队，年内完成核心业务骨干数字化技能认证全覆盖；",
    "建立季度数字化效益后评估复盘机制，重点考核单位IT投入带来的边际收益增量与实际降本空间，坚决遏制低效重复立项；",
    "稳妥有序推进算力资源绿色低碳集约化调度，通过智能变频与错峰计算，使整体PUE能耗指标保持在1.15以下先进水平；",
    "构建面向多场景的自动化应急响应与混沌演练机制，确保在任何单点基础设施发生故障时，核心交易链路无感知平滑倒换。"
  ];

  // 常见手误错字模拟库
  const TYPO_CANDIDATES = [
    { wrong: "推近", correct: "推进" },
    { wrong: "协统", correct: "协同" },
    { wrong: "技术", correct: "机制" },
    { wrong: "枪化", correct: "强化" },
    { wrong: "阻止", correct: "组织" },
    { wrong: "系同", correct: "系统" },
    { wrong: "油画", correct: "优化" },
    { wrong: "流传", correct: "流转" }
  ];

  let wordTypingTimer = null;

  function initWordModule() {
    setupWordInteractions();
    setupWordManualTyping();
    updatePageCountDisplay();
    startWordTypist();
  }

  function resumeWordTyping() {
    if (state.word.isManualPaused || state.word.isUserInteracting) return;
    if (wordTypingTimer) clearTimeout(wordTypingTimer);
    setTimeout(() => {
      scrollWordCursorIntoView(true);
    }, 80);
    scheduleNextWordChar(120);
  }

  // 一键暂停 / 恢复 Word 自动打字
  function toggleWordTypingPause(forceState) {
    if (typeof forceState === 'boolean') {
      state.word.isManualPaused = forceState;
    } else {
      state.word.isManualPaused = !state.word.isManualPaused;
    }

    const isPaused = state.word.isManualPaused;

    // 更新顶栏暂停按钮
    if (DOM.wordPauseBtn) {
      DOM.wordPauseBtn.classList.toggle('paused', isPaused);
    }
    if (DOM.wptIcon) {
      DOM.wptIcon.textContent = isPaused ? '▶️' : '⏸️';
    }
    if (DOM.wptText) {
      DOM.wptText.textContent = isPaused ? '继续打字' : '暂停打字';
    }

    // 更新底栏状态徽章
    if (DOM.wordTypingStateBadge) {
      DOM.wordTypingStateBadge.classList.toggle('paused', isPaused);
    }
    if (DOM.wtStatusLabel) {
      DOM.wtStatusLabel.textContent = isPaused ? '打字已暂停 (按 X 继续)' : '打字中 (按 X 暂停)';
    }

    // 更新打字光标呼吸样式
    if (DOM.wordBlinkingCursor) {
      DOM.wordBlinkingCursor.classList.toggle('paused', isPaused);
    }

    if (isPaused) {
      if (wordTypingTimer) clearTimeout(wordTypingTimer);
      playTickSound('beep');
      showToast('WORD: 打字已暂停 (按 X 或 Ctrl+P 继续)');
    } else {
      playTickSound('click');
      showToast('WORD: 恢复打字');
      scheduleNextWordChar(180);
    }
  }

  function scheduleNextWordChar(delay) {
    if (wordTypingTimer) clearTimeout(wordTypingTimer);
    const speedMultiplier = state.speed || 1;
    const actualDelay = Math.max(16, Math.floor(delay / speedMultiplier));
    wordTypingTimer = setTimeout(typeWordStep, actualDelay);
  }

  function typeWordStep() {
    // 若处于手动暂停模式，静止打字
    if (state.word.isManualPaused) return;

    // 若用户正在手动输入，等待用户空闲
    if (state.word.isUserInteracting) return;

    // 处理错字与退格分支
    if (state.word.typoState) {
      handleTypoStep();
      return;
    }

    const currentSentence = WORD_CORPUS[state.word.corpusIndex];
    if (!currentSentence || state.word.charIndex >= currentSentence.length) {
      // 当前句子完成，切到下一句
      state.word.corpusIndex = (state.word.corpusIndex + 1) % WORD_CORPUS.length;
      state.word.charIndex = 0;
      scheduleNextWordChar(280);
      return;
    }

    // 检查是否触发偶尔的错字退格模拟 (约 4% 几率)
    const remainingSentence = currentSentence.slice(state.word.charIndex);
    const matchedTypo = TYPO_CANDIDATES.find(t => remainingSentence.startsWith(t.correct));

    if (matchedTypo && Math.random() < 0.28) {
      state.word.typoState = {
        wrongChars: matchedTypo.wrong,
        correctChars: matchedTypo.correct,
        typedWrongCount: 0,
        stage: 'typeWrong' // 'typeWrong' -> 'pauseNotice' -> 'backspacing' -> 'typeCorrect'
      };
      handleTypoStep();
      return;
    }

    // 正常输入一个字符
    const ch = currentSentence[state.word.charIndex];
    state.word.charIndex++;
    state.word.currentParagraphCharCount++;
    state.word.wordCount++;

    if (DOM.wordTypedText) {
      DOM.wordTypedText.textContent += ch;
    }

    // 键盘音效
    if (state.currentMode === 'word') {
      playTickSound('wordKey');
    }

    // 更新底部字数统计
    if (DOM.wordWordCount) {
      DOM.wordWordCount.textContent = `字数：${state.word.wordCount.toLocaleString()}`;
    }

    // 自动保存动态联动
    state.word.charsSinceLastSave++;
    if (state.word.charsSinceLastSave >= 45) {
      state.word.charsSinceLastSave = 0;
      triggerWordAutoSave();
    }

    // 视口平滑跟随滚动 (仅在 word 模式时)
    if (state.currentMode === 'word') {
      scrollWordCursorIntoView();
    }

    // 检查是否段落换行：若当前段落字符数 >= 115 且遇到句号或分号
    if (state.word.currentParagraphCharCount >= 115 && (ch === '。' || ch === '；')) {
      finishCurrentWordParagraph();
      scheduleNextWordChar(1200);
      return;
    }

    // 拟真思考停顿计算
    let nextDelay = 75 + Math.random() * 85;
    if (ch === '。' || ch === '；' || ch === '！' || ch === '？') {
      nextDelay = 650 + Math.random() * 550; // 句末思考
    } else if (ch === '，' || ch === '、') {
      nextDelay = 300 + Math.random() * 260; // 逗号微歇
    } else if (Math.random() < 0.08) {
      nextDelay = 450 + Math.random() * 400; // 构思顿挫
    }

    scheduleNextWordChar(nextDelay);
  }

  function handleTypoStep() {
    const typo = state.word.typoState;
    if (!typo) return;

    if (typo.stage === 'typeWrong') {
      // 敲出错字中的一个字符
      const charToType = typo.wrongChars[typo.typedWrongCount];
      typo.typedWrongCount++;
      if (DOM.wordTypedText) {
        DOM.wordTypedText.textContent += charToType;
      }
      if (state.currentMode === 'word') {
        playTickSound('wordKey');
      }

      if (typo.typedWrongCount >= typo.wrongChars.length) {
        // 错字敲完了，停顿思考（模拟发现打错字）
        typo.stage = 'pauseNotice';
        scheduleNextWordChar(360 + Math.random() * 200);
      } else {
        scheduleNextWordChar(90 + Math.random() * 60);
      }
    } else if (typo.stage === 'pauseNotice') {
      // 开始退格
      typo.stage = 'backspacing';
      scheduleNextWordChar(100);
    } else if (typo.stage === 'backspacing') {
      // 退格删除一个字
      if (DOM.wordTypedText && DOM.wordTypedText.textContent.length > 0) {
        DOM.wordTypedText.textContent = DOM.wordTypedText.textContent.slice(0, -1);
      }
      if (state.currentMode === 'word') {
        playTickSound('backspace');
      }
      typo.typedWrongCount--;

      if (typo.typedWrongCount <= 0) {
        // 退格删完，短暂停顿后开始输入正确文字
        typo.stage = 'typeCorrect';
        scheduleNextWordChar(180 + Math.random() * 100);
      } else {
        scheduleNextWordChar(85 + Math.random() * 40);
      }
    } else if (typo.stage === 'typeCorrect') {
      // 敲入正确的词
      if (DOM.wordTypedText) {
        DOM.wordTypedText.textContent += typo.correctChars;
      }
      if (state.currentMode === 'word') {
        playTickSound('wordKey');
      }
      state.word.charIndex += typo.correctChars.length;
      state.word.currentParagraphCharCount += typo.correctChars.length;
      state.word.wordCount += typo.correctChars.length;
      if (DOM.wordWordCount) {
        DOM.wordWordCount.textContent = `字数：${state.word.wordCount.toLocaleString()}`;
      }
      state.word.typoState = null; // 清除错字状态
      if (state.currentMode === 'word') {
        scrollWordCursorIntoView();
      }
      scheduleNextWordChar(120 + Math.random() * 80);
    }
  }

  // 获取当前承载光标与打字段落的正文容器
  function getCurrentActivePageBody() {
    if (DOM.wordTypingPara && DOM.wordTypingPara.closest('.word-page-body')) {
      return DOM.wordTypingPara.closest('.word-page-body');
    }
    const bodies = document.querySelectorAll('.word-page-body');
    return bodies[bodies.length - 1] || null;
  }

  // 预设公文二级章节标题 (用于自动流转至新一页时的标题引导)
  const PAGE_SECTION_TITLES = [
    "六、 组织保障、资源调配与全周期协同容错机制",
    "七、 跨部门业务交付验收标准与 SLA 协议履约机制",
    "八、 数字化专项激励考核兑现细则与终审备案要求",
    "九、 附则与全集团各事业群关键节点责任书签署"
  ];
  let pageSectionIndex = 0;

  // 动态创建新的真实 A4 页面 (Page 3, Page 4...)
  function createNewWordPage() {
    if (!DOM.wordPageContainer) return;

    const pages = DOM.wordPageContainer.querySelectorAll('.word-page');
    const newPageNum = pages.length + 1;

    // 固化旧页面末尾的打字段落
    if (DOM.wordBlinkingCursor && DOM.wordBlinkingCursor.parentElement) {
      DOM.wordBlinkingCursor.remove();
    }
    if (DOM.wordTypingPara) {
      DOM.wordTypingPara.classList.remove('typing-active-line');
      DOM.wordTypingPara.removeAttribute('id');
    }
    if (DOM.wordTypedText) {
      DOM.wordTypedText.removeAttribute('id');
    }

    // 创建新的一页标准 A4 卡片
    const newPage = document.createElement('article');
    newPage.className = 'word-page';
    newPage.dataset.page = newPageNum;

    // 页眉
    const header = document.createElement('header');
    header.className = 'doc-header';
    header.contentEditable = 'false';
    header.innerHTML = `
      <span class="dh-tag">集团综合战略发展委员会 · 绝密内部实施细则</span>
      <span class="dh-page">DOC-2026-HQ-ST94</span>
    `;

    // 页面可编辑正文流主体
    const pageBody = document.createElement('div');
    pageBody.className = 'word-page-body';
    pageBody.contentEditable = 'true';
    pageBody.spellcheck = false;

    // 为新页面顶部生成一个规范的公文二级标题
    const secTitle = PAGE_SECTION_TITLES[pageSectionIndex % PAGE_SECTION_TITLES.length];
    pageSectionIndex++;
    const h2 = document.createElement('h2');
    h2.className = 'doc-h2';
    h2.textContent = secTitle;
    pageBody.appendChild(h2);

    // 新页面的打字段落
    const newPara = document.createElement('p');
    newPara.id = 'word-typing-para';
    newPara.className = 'doc-para typing-active-line';

    const newTextSpan = document.createElement('span');
    newTextSpan.id = 'word-typed-text';

    const newCursor = document.createElement('span');
    newCursor.id = 'word-blinking-cursor';
    newCursor.className = 'word-blinking-cursor';

    newPara.appendChild(newTextSpan);
    newPara.appendChild(newCursor);
    pageBody.appendChild(newPara);

    // 页脚
    const footer = document.createElement('footer');
    footer.className = 'doc-footer';
    footer.contentEditable = 'false';
    footer.innerHTML = `<span class="df-page-number">— ${newPageNum} —</span>`;

    newPage.appendChild(header);
    newPage.appendChild(pageBody);
    newPage.appendChild(footer);

    DOM.wordPageContainer.appendChild(newPage);

    DOM.wordTypingPara = newPara;
    DOM.wordTypedText = newTextSpan;
    DOM.wordBlinkingCursor = newCursor;
    state.word.currentParagraphCharCount = 0;

    updatePageCountDisplay();
    scrollWordCursorIntoView(true);
  }

  // 在当前页内继续开辟新段落书写
  function appendNewParagraphInCurrentPage(pageBody) {
    if (DOM.wordBlinkingCursor && DOM.wordBlinkingCursor.parentElement) {
      DOM.wordBlinkingCursor.remove();
    }
    if (DOM.wordTypingPara) {
      DOM.wordTypingPara.classList.remove('typing-active-line');
      DOM.wordTypingPara.removeAttribute('id');
    }
    if (DOM.wordTypedText) {
      DOM.wordTypedText.removeAttribute('id');
    }

    const newPara = document.createElement('p');
    newPara.id = 'word-typing-para';
    newPara.className = 'doc-para typing-active-line';

    const newTextSpan = document.createElement('span');
    newTextSpan.id = 'word-typed-text';

    const newCursor = document.createElement('span');
    newCursor.id = 'word-blinking-cursor';
    newCursor.className = 'word-blinking-cursor';

    newPara.appendChild(newTextSpan);
    newPara.appendChild(newCursor);
    pageBody.appendChild(newPara);

    DOM.wordTypingPara = newPara;
    DOM.wordTypedText = newTextSpan;
    DOM.wordBlinkingCursor = newCursor;

    if (state.currentMode === 'word') {
      scrollWordCursorIntoView();
    }
  }

  // 段落书写完毕：只有当前页真正饱满写满（>= 4 个段落或文字饱满）时才开启新页，否则在本页继续写
  function finishCurrentWordParagraph() {
    state.word.currentParagraphCharCount = 0;
    const pageBody = getCurrentActivePageBody();
    if (!pageBody) return;

    // 检查当前页面是否已经写满 (已有 4 个及以上段落，或正文字数超过 520 字)
    const currentParas = pageBody.querySelectorAll('p');
    const currentChars = pageBody.innerText.replace(/\s+/g, '').length;

    if (currentParas.length >= 4 || currentChars >= 520) {
      createNewWordPage();
    } else {
      appendNewParagraphInCurrentPage(pageBody);
    }
  }

  // 极致平滑视口跟随：使打字行始终稳定在屏幕黄金视线中心 (带舒适死区，绝不晃眼)
  function scrollWordCursorIntoView(force = false) {
    if (!DOM.wordWorkspace || !DOM.wordBlinkingCursor) return;

    const ws = DOM.wordWorkspace;
    const wsRect = ws.getBoundingClientRect();
    const curRect = DOM.wordBlinkingCursor.getBoundingClientRect();

    const curTop = curRect.top - wsRect.top;
    const targetY = wsRect.height * 0.60;

    // 只有当光标快要低于 72% 视口，或高于 15%，或强制跟随翻页时才微调滚动
    if (force || curTop > wsRect.height * 0.72 || curTop < wsRect.height * 0.15) {
      const scrollDiff = curTop - targetY;
      ws.scrollBy({
        top: scrollDiff,
        behavior: 'smooth'
      });
    }
  }

  // 动态更新状态栏页码 (根据当前视口滚动的中心位置感知)
  function updatePageCountDisplay() {
    if (!DOM.wordWorkspace || !DOM.wordPageCount) return;
    const pages = DOM.wordWorkspace.querySelectorAll('.word-page');
    if (!pages.length) return;

    const totalPages = pages.length;
    const wsRect = DOM.wordWorkspace.getBoundingClientRect();
    const centerY = wsRect.top + wsRect.height * 0.5;

    let activePage = 1;
    pages.forEach((p, idx) => {
      const pRect = p.getBoundingClientRect();
      if (pRect.top <= centerY && pRect.bottom >= centerY) {
        activePage = idx + 1;
      }
    });

    DOM.wordPageCount.textContent = `第 ${activePage} 页，共 ${totalPages} 页`;
  }

  function triggerWordAutoSave() {
    if (DOM.wordTopSaveStatus) {
      DOM.wordTopSaveStatus.textContent = '- 正在保存...';
    }
    if (DOM.wordBottomSaveStatus) {
      DOM.wordBottomSaveStatus.innerHTML = '<span class="ws-cloud-icon">🔄</span> 正在保存...';
    }
    setTimeout(() => {
      if (DOM.wordTopSaveStatus) {
        DOM.wordTopSaveStatus.textContent = '- 已保存到 OneDrive';
      }
      if (DOM.wordBottomSaveStatus) {
        DOM.wordBottomSaveStatus.innerHTML = '<span class="ws-cloud-icon">☁️</span> 已保存到 OneDrive';
      }
    }, 1400);
  }

  // 用户手工打字与编辑全局接管
  function handleUserManualInput(e) {
    state.word.isUserInteracting = true;
    if (wordTypingTimer) clearTimeout(wordTypingTimer);

    if (e.type === 'keydown' && e.key && e.key.length === 1) {
      playTickSound('wordKey');
    } else if (e.type === 'keydown' && e.key === 'Backspace') {
      playTickSound('backspace');
    }

    // 重新统计所有页面中的总字数
    let totalChars = 0;
    const bodies = document.querySelectorAll('.word-page-body');
    bodies.forEach(b => {
      totalChars += (b.innerText || '').replace(/\s+/g, '').length;
    });
    state.word.wordCount = Math.max(3800, totalChars + 2200);
    if (DOM.wordWordCount) {
      DOM.wordWordCount.textContent = `字数：${state.word.wordCount.toLocaleString()}`;
    }

    scrollWordCursorIntoView();

    if (state.word.userIdleTimeout) clearTimeout(state.word.userIdleTimeout);
    state.word.userIdleTimeout = setTimeout(() => {
      state.word.isUserInteracting = false;
      ensureWordTypingAnchor();
      scheduleNextWordChar(400);
    }, 3500);
  }

  function setupWordManualTyping() {
    if (DOM.wordPageContainer) {
      DOM.wordPageContainer.addEventListener('input', handleUserManualInput);
      DOM.wordPageContainer.addEventListener('keydown', handleUserManualInput);
    }
    if (DOM.wordWorkspace) {
      DOM.wordWorkspace.addEventListener('scroll', updatePageCountDisplay);
    }
  }

  function ensureWordTypingAnchor() {
    const pageBody = getCurrentActivePageBody();
    if (!pageBody) return;

    let para = document.getElementById('word-typing-para');
    if (!para) {
      para = document.createElement('p');
      para.id = 'word-typing-para';
      para.className = 'doc-para typing-active-line';

      const textSpan = document.createElement('span');
      textSpan.id = 'word-typed-text';

      const cursor = document.createElement('span');
      cursor.id = 'word-blinking-cursor';
      cursor.className = 'word-blinking-cursor';

      para.appendChild(textSpan);
      para.appendChild(cursor);
      pageBody.appendChild(para);

      DOM.wordTypingPara = para;
      DOM.wordTypedText = textSpan;
      DOM.wordBlinkingCursor = cursor;
    } else {
      DOM.wordTypingPara = para;
      DOM.wordTypedText = para.querySelector('#word-typed-text') || para;
      let cursor = para.querySelector('#word-blinking-cursor');
      if (!cursor) {
        cursor = document.createElement('span');
        cursor.id = 'word-blinking-cursor';
        cursor.className = 'word-blinking-cursor';
        para.appendChild(cursor);
      }
      DOM.wordBlinkingCursor = cursor;
    }
  }

  // Ribbon 与 UI 工具栏的拟真微交互
  function setupWordInteractions() {
    // 1. Ribbon 选项卡切换
    const tabs = document.querySelectorAll('.word-tabs .w-tab:not(.file-tab):not(.w-tab-action)');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        playTickSound('click');
      });
    });

    // 2. 格式按钮 (B/I/U等) 切换高亮
    const toggleBtns = document.querySelectorAll('.wt-group .wt-tb-btn');
    toggleBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        playTickSound('click');
      });
    });

    // 3. 样式卡片切换
    const styleCards = document.querySelectorAll('.wt-style-card');
    styleCards.forEach(card => {
      card.addEventListener('click', () => {
        styleCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        playTickSound('click');
      });
    });

    // 4. 自动保存开关切换
    const autosaveBtn = document.querySelector('.wt-autosave');
    if (autosaveBtn) {
      autosaveBtn.addEventListener('click', () => {
        const toggle = autosaveBtn.querySelector('.wt-toggle-switch');
        if (toggle) {
          toggle.classList.toggle('active');
          const isOn = toggle.classList.contains('active');
          toggle.style.background = isOn ? '#107c41' : '#8a8886';
          const thumb = toggle.querySelector('.wt-toggle-thumb');
          if (thumb) {
            thumb.style.left = isOn ? 'auto' : '2px';
            thumb.style.right = isOn ? '2px' : 'auto';
          }
          showToast(isOn ? 'AUTOSAVE: ON (ONEDRIVE SYNC)' : 'AUTOSAVE: OFF (LOCAL ONLY)');
        }
      });
    }

    // 5. 视图切换按钮
    const viewBtns = document.querySelectorAll('.ws-view-btn');
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        viewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        playTickSound('click');
      });
    });

    // 6. 一键暂停/恢复打字切换按钮与状态徽章点击绑定
    if (DOM.wordPauseBtn) {
      DOM.wordPauseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWordTypingPause();
      });
    }
    if (DOM.wordTypingStateBadge) {
      DOM.wordTypingStateBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWordTypingPause();
      });
    }
  }

  function startWordTypist() {
    scheduleNextWordChar(600);
  }

  // --------------------------------------------------------------------------
  // 11. OpenAI o1-preview 深度思考大模型 (CHATGPT 拟真思考界面)
  // --------------------------------------------------------------------------
  const CHATGPT_COT_STEPS = [
    "Analyzing global latency topology: High round-trip time (RTT ~180-210ms) between transatlantic datacenters precludes single-leader synchronous consensus.",
    "Formulating Multi-Raft partitioning: Assigning separate consensus groups per financial asset class to eliminate global locking contention.",
    "Evaluating Hybrid Logical Clocks (HLC) vs Spanner TrueTime: HLC bounds causality without requiring GPS hardware synchronization.",
    "Deriving zero-split-brain quorum theorem: Proving 3-region quorum (2/3 majority) guarantees linearizability under arbitrary split-brain partitions.",
    "Designing bounded asynchronous replication: In-flight transactions pipelined through deterministic pre-sequencing queues.",
    "Optimizing in-memory cache locality: Ring buffers aligned to 64-byte CPU cache lines with false sharing mitigation.",
    "Evaluating concurrency control: Benchmarking Serializable Snapshot Isolation (SSI) vs Calvin deterministic scheduling for 10M TPS.",
    "Formalizing state machine safety invariant: Transitions across all read-replicas satisfy strictly deterministic replay guarantees.",
    "Constructing lock-free order-book arena allocator: Eliminating runtime garbage collection pauses and page faults via mlock().",
    "Verifying transient WAN jitter tolerance: Adjusting Raft election timeouts with exponential randomized backoff parameters.",
    "Ensuring zero phantom transactions: Proving Write-Ahead Log (WAL) fsync batching preserves ACID recovery idempotency.",
    "Synthesizing decoupling architecture: In-memory core matching decoupled from asynchronous multi-datacenter ledger settlement.",
    "Validating disaster recovery bounds: Verifying RPO = 0 and RTO < 500ms across asymmetric network cuts.",
    "Structuring comprehensive response: Synthesizing executive architectural diagram, state machine proofs, and high-concurrency benchmarks."
  ];

  const CHATGPT_LIVE_LABELS = [
    "Exploring Multi-Raft quorum consensus invariants...",
    "Proving safety bounds under 200ms transatlantic RTT jitter...",
    "Deriving zero-allocation matching queue memory layouts...",
    "Synthesizing linearizability proofs for snapshot isolation...",
    "Simulating network split-brain partition recovery...",
    "Validating RocksDB WAL write batch throughput limits...",
    "Formulating cross-region ACID settlement matrix..."
  ];

  let chatgptCotTimer = null;
  let chatgptSecondInterval = null;

  function initChatgptModule() {
    setupChatgptInteractions();
    preloadInitialCot();
    startChatgptThinkingDaemon();
  }

  function setupChatgptInteractions() {
    if (DOM.chatgptThoughtToggle) {
      DOM.chatgptThoughtToggle.addEventListener('click', () => {
        if (!DOM.chatgptThoughtBox) return;
        DOM.chatgptThoughtBox.classList.toggle('collapsed');
        state.chatgpt.isCollapsed = DOM.chatgptThoughtBox.classList.contains('collapsed');
        playTickSound('click');
      });
    }
  }

  function formatThinkingTime(totalSecs) {
    if (totalSecs < 60) {
      return `Thinking for ${totalSecs} seconds`;
    }
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `Thinking for ${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }

  function preloadInitialCot() {
    if (!DOM.chatgptCotStream) return;
    DOM.chatgptCotStream.innerHTML = '';
    // 预填入前 4 条已完成思考步骤
    for (let i = 0; i < 4; i++) {
      appendCotStep(CHATGPT_COT_STEPS[i], i === 3);
    }
    state.chatgpt.stepIndex = 4;
  }

  function appendCotStep(text, isLatest = false) {
    if (!DOM.chatgptCotStream) return;

    // 清除旧的 latest 标记
    const oldLatest = DOM.chatgptCotStream.querySelectorAll('.cot-step-item.latest');
    oldLatest.forEach(el => el.classList.remove('latest'));

    const item = document.createElement('div');
    item.className = `cot-step-item ${isLatest ? 'latest' : ''}`;
    item.textContent = text;
    DOM.chatgptCotStream.appendChild(item);

    // 平滑滚动到底部
    if (DOM.chatgptScrollContainer && state.currentMode === 'chatgpt') {
      DOM.chatgptScrollContainer.scrollTo({
        top: DOM.chatgptScrollContainer.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  function startChatgptThinkingDaemon() {
    // 1. 每秒递增思考计时器
    if (chatgptSecondInterval) clearInterval(chatgptSecondInterval);
    chatgptSecondInterval = setInterval(() => {
      state.chatgpt.thinkingSeconds++;
      if (DOM.chatgptThinkingTimerText) {
        DOM.chatgptThinkingTimerText.textContent = formatThinkingTime(state.chatgpt.thinkingSeconds);
      }
    }, 1000);

    // 2. 调度下一条深度思考推导步骤
    scheduleNextCotStep(2600);
  }

  function scheduleNextCotStep(delay) {
    if (chatgptCotTimer) clearTimeout(chatgptCotTimer);
    const speedMultiplier = state.speed || 1;
    const actualDelay = Math.max(450, Math.floor(delay / speedMultiplier));
    chatgptCotTimer = setTimeout(triggerNextCotStep, actualDelay);
  }

  function triggerNextCotStep() {
    const nextStepText = CHATGPT_COT_STEPS[state.chatgpt.stepIndex % CHATGPT_COT_STEPS.length];
    state.chatgpt.stepIndex++;

    appendCotStep(nextStepText, true);

    if (state.currentMode === 'chatgpt') {
      playTickSound('click');
    }

    // 随机轮换底部指示器文案
    if (DOM.chatgptCotLiveLabel) {
      const randomLabel = CHATGPT_LIVE_LABELS[Math.floor(Math.random() * CHATGPT_LIVE_LABELS.length)];
      DOM.chatgptCotLiveLabel.textContent = randomLabel;
    }

    // 下一条思考步骤间隔在 2.5s ~ 4.8s 之间
    scheduleNextCotStep(2500 + Math.random() * 2300);
  }

  function resumeChatgptThinking() {
    scheduleNextCotStep(600);
  }

  // --------------------------------------------------------------------------
  // 12. Canvas 响应式重置与主循环初始化
  // --------------------------------------------------------------------------
  function resizeCanvases() {
    const canvases = [DOM.lossCanvas, DOM.radarCanvas, DOM.klineCanvas];
    canvases.forEach(canvas => {
      if (canvas && canvas.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    });

    if (state.isBossMode) {
      drawBossChart();
    } else {
      if (state.currentMode === 'llm') drawLossChart();
      if (state.currentMode === 'cyber') drawRadar();
      if (state.currentMode === 'quant') drawKlineChart();
    }
  }

  window.addEventListener('resize', resizeCanvases);

  // 初始化引擎
  function initEngine() {
    setupControlBar();
    initWakeLock();

    // 绑定滚轮监听
    setupScrollDetection(DOM.logStreamLlm, DOM.scrollStateLlm, 'llm');
    setupScrollDetection(DOM.logStreamDevops, DOM.scrollStateDevops, 'devops');
    setupScrollDetection(DOM.logStreamCyber, DOM.scrollStateCyber, 'cyber');
    setupScrollDetection(DOM.logStreamQuant, DOM.scrollStateQuant, 'quant');

    // 初始化各模式数据骨架
    initLlmGpuGrid();
    initDevopsK8sGrid();
    initCyberRadar();
    initKlineData();
    initWordModule();
    initChatgptModule();

    // 调整 Canvas 尺寸
    setTimeout(resizeCanvases, 100);

    // 启动多频率驱动时钟
    // 1. 高频刷新: 雷达扫描与 K 线微步 (每 30ms ~ 33fps)
    setInterval(() => {
      drawRadar();
      updateHexDump();
    }, 40);

    setInterval(() => {
      updateQuantTick();
    }, 120);

    // 2. 中频刷新: 指标更新与日常日志生成 (根据 speed 倍速)
    setInterval(() => {
      updateLlmMetrics();
      updateDevopsState();
    }, 450);

    // 3. 动态日志流生成 (自然间隔)
    setInterval(() => {
      pushLlmLog();
      pushDevopsLog();
      pushCyberLog();
      pushQuantLog();
    }, 280);

    // 欢迎提示
    showToast('SYSTEM ACTIVE :: SCREEN WAKE LOCK ENGAGED');
  }

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEngine);
  } else {
    initEngine();
  }

})();
