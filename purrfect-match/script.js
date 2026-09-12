(function(){
  // ---------------- config ----------------
  // Set this to your deployed Cloudflare Worker URL (see backend/README.md).
  var BACKEND_URL = 'PASTE_YOUR_WORKER_URL_HERE';
  var BACKEND_READY = BACKEND_URL.indexOf('http') === 0;

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  async function callApi(path, body){
    if (!BACKEND_READY){
      throw new Error("This demo's AI backend isn't connected yet. Sherin's still wiring it up. Check back soon!");
    }
    var res;
    try {
      res = await fetch(BACKEND_URL + path, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw new Error('Could not reach the AI backend. Check your connection and try again.');
    }
    var data;
    try { data = await res.json(); } catch(e){ data = null; }
    if (!res.ok){
      throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    }
    return data;
  }

  // ---------------- tabs ----------------
  var tabNav = document.getElementById('tabNav');
  tabNav.addEventListener('click', function(e){
    var btn = e.target.closest('.tab-btn');
    if (!btn) return;
    tabNav.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('main .panel').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });

  document.getElementById('detailsToggle').addEventListener('click', function(){
    document.getElementById('detailsCard').classList.toggle('collapsed');
  });

  // ---------------- shared CV/job state ----------------
  var cvInput = document.getElementById('cvInput');
  var jobInput = document.getElementById('jobInput');
  var cvCount = document.getElementById('cvCount');
  var jobCount = document.getElementById('jobCount');

  function loadSaved(key, el){
    try { el.value = localStorage.getItem(key) || ''; } catch(e){}
  }
  function saveField(key, el, countEl){
    try { localStorage.setItem(key, el.value); } catch(e){}
    countEl.textContent = el.value.length + ' / 9000';
  }
  loadSaved('pm_cv', cvInput);
  loadSaved('pm_job', jobInput);
  cvCount.textContent = cvInput.value.length + ' / 9000';
  jobCount.textContent = jobInput.value.length + ' / 9000';
  cvInput.addEventListener('input', function(){ saveField('pm_cv', cvInput, cvCount); });
  jobInput.addEventListener('input', function(){ saveField('pm_job', jobInput, jobCount); });

  function showError(el, msg){ el.textContent = '⚠️ ' + msg; el.classList.add('show'); }
  function hideError(el){ el.classList.remove('show'); el.textContent=''; }

  // ---------------- MATCH ----------------
  var analyzeBtn = document.getElementById('analyzeBtn');
  var analyzeLoading = document.getElementById('analyzeLoading');
  var analyzeError = document.getElementById('analyzeError');
  var analyzeResult = document.getElementById('analyzeResult');

  analyzeBtn.addEventListener('click', async function(){
    hideError(analyzeError);
    analyzeResult.innerHTML = '';
    if (!cvInput.value.trim() || !jobInput.value.trim()){
      showError(analyzeError, 'Add both your CV and a job description above first.');
      return;
    }
    analyzeBtn.disabled = true; analyzeLoading.classList.add('show');
    try {
      var data = await callApi('/purrfect-match/analyze', { cv: cvInput.value, job: jobInput.value });
      renderMatch(data);
    } catch (e) {
      showError(analyzeError, e.message);
    } finally {
      analyzeBtn.disabled = false; analyzeLoading.classList.remove('show');
    }
  });

  function renderMatch(data){
    var score = Math.max(0, Math.min(100, Math.round(data.matchScore || 0)));
    var circumference = 2 * Math.PI * 40;
    var dash = (score/100) * circumference;
    var good = (data.overlappingSkills || []).map(function(s){ return '<span class="pill good">✓ ' + escapeHtml(s) + '</span>'; }).join('');
    var gap = (data.missingSkills || []).map(function(s){ return '<span class="pill gap">△ ' + escapeHtml(s) + '</span>'; }).join('');
    var suggestions = (data.suggestions || []).map(function(s){
      return '<div class="suggestion"><div class="lbl">Suggested rewrite</div>' +
        '<div class="orig">' + escapeHtml(s.original || '') + '</div>' +
        '<div class="rewrite">→ ' + escapeHtml(s.rewritten || '') + '</div></div>';
    }).join('');

    analyzeResult.innerHTML =
      '<div class="score-row">' +
        '<div class="score-ring"><svg width="96" height="96" viewBox="0 0 96 96">' +
          '<circle class="track" cx="48" cy="48" r="40"></circle>' +
          '<circle class="fill" cx="48" cy="48" r="40" stroke-dasharray="' + dash.toFixed(1) + ' ' + circumference.toFixed(1) + '"></circle>' +
        '</svg><div class="num">' + score + '</div></div>' +
        '<div class="score-summary">' + escapeHtml(data.summary || '') + '</div>' +
      '</div>' +
      (good ? '<div class="pill-group"><h4>What genuinely overlaps</h4><div class="pill-list">' + good + '</div></div>' : '') +
      (gap ? '<div class="pill-group"><h4>What\'s missing</h4><div class="pill-list">' + gap + '</div></div>' : '') +
      (suggestions ? '<div class="pill-group"><h4>Wording suggestions</h4>' + suggestions + '</div>' : '');
  }

  // ---------------- CHAT ----------------
  var chatWindow = document.getElementById('chatWindow');
  var chatInput = document.getElementById('chatInput');
  var chatSend = document.getElementById('chatSend');
  var chatError = document.getElementById('chatError');
  var chatHistory = [];

  function addMsg(role, text){
    var div = document.createElement('div');
    div.className = 'msg ' + (role === 'user' ? 'user' : 'bot');
    div.textContent = text;
    chatWindow.appendChild(div);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  async function sendChat(){
    var text = chatInput.value.trim();
    if (!text) return;
    hideError(chatError);
    addMsg('user', text);
    chatHistory.push({ role: 'user', content: text });
    chatInput.value = '';
    chatSend.disabled = true;
    var typingDiv = document.createElement('div');
    typingDiv.className = 'msg bot';
    typingDiv.textContent = '...';
    chatWindow.appendChild(typingDiv);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    try {
      var data = await callApi('/purrfect-match/chat', {
        message: text, history: chatHistory.slice(0, -1),
        cv: cvInput.value, job: jobInput.value
      });
      typingDiv.textContent = data.reply || '...';
      chatHistory.push({ role: 'assistant', content: data.reply || '' });
    } catch (e) {
      typingDiv.remove();
      showError(chatError, e.message);
    } finally {
      chatSend.disabled = false;
    }
  }
  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') sendChat(); });

  // ---------------- INTERVIEW ----------------
  var interviewBtn = document.getElementById('interviewBtn');
  var interviewLoading = document.getElementById('interviewLoading');
  var interviewError = document.getElementById('interviewError');
  var interviewResult = document.getElementById('interviewResult');

  interviewBtn.addEventListener('click', async function(){
    hideError(interviewError);
    interviewResult.innerHTML = '';
    if (!jobInput.value.trim()){
      showError(interviewError, 'Add a job description above first.');
      return;
    }
    interviewBtn.disabled = true; interviewLoading.classList.add('show');
    try {
      var data = await callApi('/purrfect-match/interview-questions', { job: jobInput.value, cv: cvInput.value });
      interviewResult.innerHTML = (data.questions || []).map(function(q){
        return '<div class="q-item"><span class="q-cat">' + escapeHtml(q.category || '') + '</span>' +
          '<div class="q-text">' + escapeHtml(q.question || '') + '</div></div>';
      }).join('');
    } catch (e) {
      showError(interviewError, e.message);
    } finally {
      interviewBtn.disabled = false; interviewLoading.classList.remove('show');
    }
  });

  // ---------------- COVER LETTER ----------------
  var coverBtn = document.getElementById('coverBtn');
  var coverLoading = document.getElementById('coverLoading');
  var coverError = document.getElementById('coverError');
  var coverResult = document.getElementById('coverResult');

  coverBtn.addEventListener('click', async function(){
    hideError(coverError);
    coverResult.innerHTML = '';
    if (!cvInput.value.trim() || !jobInput.value.trim()){
      showError(coverError, 'Add both your CV and a job description above first.');
      return;
    }
    coverBtn.disabled = true; coverLoading.classList.add('show');
    try {
      var data = await callApi('/purrfect-match/cover-letter', { cv: cvInput.value, job: jobInput.value });
      var letter = data.letter || '';
      coverResult.innerHTML = '<div class="letter-box" id="letterBox"></div>' +
        '<button class="btn btn-ghost btn-sm" id="copyLetter" style="margin-top:12px;">📋 Copy to clipboard</button>';
      document.getElementById('letterBox').textContent = letter;
      document.getElementById('copyLetter').addEventListener('click', function(){
        navigator.clipboard.writeText(letter).then(function(){
          var b = document.getElementById('copyLetter');
          var old = b.textContent; b.textContent = '✅ Copied!';
          setTimeout(function(){ b.textContent = old; }, 1500);
        });
      });
    } catch (e) {
      showError(coverError, e.message);
    } finally {
      coverBtn.disabled = false; coverLoading.classList.remove('show');
    }
  });

  // ---------------- JOURNAL (localStorage only) ----------------
  var journalList = document.getElementById('journalList');
  var jFilters = document.getElementById('jFilters');
  var activeFilter = 'all';

  function getEntries(){
    try { return JSON.parse(localStorage.getItem('pm_journal') || '[]'); } catch(e){ return []; }
  }
  function saveEntries(list){
    try { localStorage.setItem('pm_journal', JSON.stringify(list)); } catch(e){}
  }
  function renderJournal(){
    var entries = getEntries().sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
    if (activeFilter !== 'all') entries = entries.filter(function(e){ return e.status === activeFilter; });
    if (!entries.length){
      journalList.innerHTML = '<p class="empty-note">No entries yet' + (activeFilter !== 'all' ? ' for "' + activeFilter + '"' : '') + '. Add your first application above!</p>';
      return;
    }
    journalList.innerHTML = entries.map(function(e){
      return '<div class="entry" data-id="' + e.id + '">' +
        '<div class="entry-main">' +
          '<div class="role">' + escapeHtml(e.role || '(role)') + '</div>' +
          '<div class="co">' + escapeHtml(e.company || '(company)') + '</div>' +
          (e.notes ? '<div class="notes">' + escapeHtml(e.notes) + '</div>' : '') +
        '</div>' +
        '<div class="entry-meta">' +
          '<span class="status-badge status-' + e.status + '">' + e.status + '</span>' +
          '<span class="entry-date">' + (e.date || '') + '</span>' +
          '<button class="del-btn" data-del="' + e.id + '" title="Delete">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  jFilters.addEventListener('click', function(e){
    var btn = e.target.closest('.filter-pill');
    if (!btn) return;
    jFilters.querySelectorAll('.filter-pill').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    activeFilter = btn.dataset.status;
    renderJournal();
  });
  journalList.addEventListener('click', function(e){
    var btn = e.target.closest('[data-del]');
    if (!btn) return;
    var id = btn.dataset.del;
    saveEntries(getEntries().filter(function(en){ return String(en.id) !== String(id); }));
    renderJournal();
  });
  document.getElementById('jAdd').addEventListener('click', function(){
    var company = document.getElementById('jCompany').value.trim();
    var role = document.getElementById('jRole').value.trim();
    var status = document.getElementById('jStatus').value;
    var date = document.getElementById('jDate').value || new Date().toISOString().slice(0,10);
    var notes = document.getElementById('jNotes').value.trim();
    if (!company && !role) return;
    var entries = getEntries();
    entries.push({ id: Date.now(), company: company, role: role, status: status, date: date, notes: notes });
    saveEntries(entries);
    document.getElementById('jCompany').value = '';
    document.getElementById('jRole').value = '';
    document.getElementById('jNotes').value = '';
    document.getElementById('jDate').value = '';
    renderJournal();
  });
  renderJournal();

  // ---------------- GAMES: tab switching ----------------
  document.querySelector('.game-tabs').addEventListener('click', function(e){
    var btn = e.target.closest('.tab-btn');
    if (!btn) return;
    this.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
    btn.classList.add('active');
    document.querySelectorAll('.game-panel').forEach(function(p){ p.classList.remove('active'); });
    document.getElementById('game-' + btn.dataset.game).classList.add('active');
  });

  // ---------------- SNAKE ----------------
  (function(){
    var canvas = document.getElementById('snakeCanvas');
    var ctx = canvas.getContext('2d');
    var grid = 18, cols = canvas.width/grid, rows = canvas.height/grid;
    var snake, dir, nextDir, food, score, loopId, running;
    var scoreEl = document.getElementById('snakeScore');
    var statusEl = document.getElementById('snakeStatus');

    function reset(){
      snake = [{x:8,y:9},{x:7,y:9},{x:6,y:9}];
      dir = {x:1,y:0}; nextDir = {x:1,y:0};
      score = 0; scoreEl.textContent = 0;
      placeFood();
      running = true; statusEl.textContent = 'Go!';
    }
    function placeFood(){
      food = { x: Math.floor(Math.random()*cols), y: Math.floor(Math.random()*rows) };
    }
    function tick(){
      if (!running) return;
      dir = nextDir;
      var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || snake.some(function(s){return s.x===head.x && s.y===head.y;})){
        running = false; statusEl.textContent = 'Game over, press Start to retry';
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y){
        score++; scoreEl.textContent = score; placeFood();
      } else {
        snake.pop();
      }
      draw();
    }
    function draw(){
      var css = getComputedStyle(document.documentElement);
      ctx.fillStyle = css.getPropertyValue('--surface-soft').trim() || '#fff0e4';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = css.getPropertyValue('--accent-3').trim() || '#ffbc42';
      ctx.beginPath(); ctx.arc(food.x*grid+grid/2, food.y*grid+grid/2, grid/2.4, 0, Math.PI*2); ctx.fill();
      snake.forEach(function(s, i){
        ctx.fillStyle = i === 0 ? (css.getPropertyValue('--accent-deep').trim() || '#e14d76') : (css.getPropertyValue('--accent').trim() || '#ff6f91');
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(s.x*grid+1, s.y*grid+1, grid-2, grid-2, 5) : ctx.rect(s.x*grid+1, s.y*grid+1, grid-2, grid-2);
        ctx.fill();
      });
    }
    function setDir(x,y){ if (dir.x === -x && dir.y === -y) return; nextDir = {x:x,y:y}; }
    document.addEventListener('keydown', function(e){
      if (!document.getElementById('game-snake').classList.contains('active')) return;
      if (e.key === 'ArrowUp') setDir(0,-1);
      else if (e.key === 'ArrowDown') setDir(0,1);
      else if (e.key === 'ArrowLeft') setDir(-1,0);
      else if (e.key === 'ArrowRight') setDir(1,0);
      else return;
      e.preventDefault();
    });
    var touchStartX, touchStartY;
    canvas.addEventListener('touchstart', function(e){ var t=e.touches[0]; touchStartX=t.clientX; touchStartY=t.clientY; }, {passive:true});
    canvas.addEventListener('touchend', function(e){
      var t = e.changedTouches[0];
      var dx = t.clientX - touchStartX, dy = t.clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy)) setDir(dx>0?1:-1, 0); else setDir(0, dy>0?1:-1);
    }, {passive:true});
    document.getElementById('snakeStart').addEventListener('click', function(){
      clearInterval(loopId);
      reset(); draw();
      loopId = setInterval(tick, 110);
    });
    reset(); draw(); running = false; statusEl.textContent = 'Press Start';
  })();

  // ---------------- FLAPPY CAT ----------------
  (function(){
    var canvas = document.getElementById('flappyCanvas');
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var cat, pipes, score, running, loopId, gravity = 0.45, flap = -7.5;
    var scoreEl = document.getElementById('flappyScore');
    var statusEl = document.getElementById('flappyStatus');

    function reset(){
      cat = { x: 70, y: H/2, vy: 0, r: 13 };
      pipes = [ makePipe(W + 40) ];
      score = 0; scoreEl.textContent = 0;
      running = true; statusEl.textContent = 'Go!';
    }
    function makePipe(x){
      var gap = 120;
      var top = 40 + Math.random() * (H - gap - 80);
      return { x: x, top: top, gap: gap, passed: false };
    }
    function step(){
      if (!running) return;
      cat.vy += gravity; cat.y += cat.vy;
      pipes.forEach(function(p){ p.x -= 2.6; });
      if (pipes[pipes.length-1].x < W - 190) pipes.push(makePipe(W + 20));
      pipes = pipes.filter(function(p){ return p.x > -60; });

      pipes.forEach(function(p){
        if (!p.passed && p.x + 26 < cat.x){ p.passed = true; score++; scoreEl.textContent = score; }
        var hitX = cat.x + cat.r > p.x && cat.x - cat.r < p.x + 26;
        var hitY = cat.y - cat.r < p.top || cat.y + cat.r > p.top + p.gap;
        if (hitX && hitY) running = false;
      });
      if (cat.y + cat.r > H || cat.y - cat.r < 0) running = false;
      if (!running) statusEl.textContent = 'Game over, press Start to retry';
      draw();
    }
    function draw(){
      var css = getComputedStyle(document.documentElement);
      ctx.fillStyle = css.getPropertyValue('--surface-soft').trim() || '#fff0e4';
      ctx.fillRect(0,0,W,H);
      ctx.fillStyle = css.getPropertyValue('--accent-4').trim() || '#6fbf7a';
      pipes.forEach(function(p){
        ctx.fillRect(p.x, 0, 26, p.top);
        ctx.fillRect(p.x, p.top + p.gap, 26, H - p.top - p.gap);
      });
      ctx.font = (cat.r*2.1) + 'px serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(cat.x, cat.y);
      ctx.rotate(Math.max(-0.5, Math.min(0.9, cat.vy/10)));
      ctx.fillText('🐈', 0, 2);
      ctx.restore();
    }
    function doFlap(){
      if (!running){ reset(); }
      cat.vy = flap;
    }
    canvas.addEventListener('mousedown', doFlap);
    canvas.addEventListener('touchstart', function(e){ e.preventDefault(); doFlap(); }, {passive:false});
    document.addEventListener('keydown', function(e){
      if (!document.getElementById('game-flappy').classList.contains('active')) return;
      if (e.key === ' '){ e.preventDefault(); doFlap(); }
    });
    document.getElementById('flappyStart').addEventListener('click', doFlap);
    reset(); draw(); running = false; statusEl.textContent = 'Press Start / Flap';
    loopId = setInterval(step, 1000/60);
  })();

})();
