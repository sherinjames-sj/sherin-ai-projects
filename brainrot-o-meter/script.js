(function(){
  var BACKEND_URL = 'PASTE_YOUR_WORKER_URL_HERE';
  var BACKEND_READY = BACKEND_URL.indexOf('http') === 0;

  var textInput = document.getElementById('textInput');
  var charCount = document.getElementById('charCount');
  var diagnoseBtn = document.getElementById('diagnoseBtn');
  var translateBtn = document.getElementById('translateBtn');
  var diagnoseLoading = document.getElementById('diagnoseLoading');
  var errorBanner = document.getElementById('errorBanner');
  var resultBox = document.getElementById('resultBox');
  var translateWrap = document.getElementById('translateWrap');
  var translateBox = document.getElementById('translateBox');

  textInput.addEventListener('input', function(){
    charCount.textContent = textInput.value.length + ' / 4000';
  });

  function showError(msg){ errorBanner.textContent = '⚠️ ' + msg; errorBanner.classList.add('show'); }
  function hideError(){ errorBanner.classList.remove('show'); errorBanner.textContent = ''; }

  function friendlyError(e){
    if (!BACKEND_READY) return "This demo's AI backend isn't connected yet. Sherin's still wiring it up. Check back soon!";
    return e && e.message ? e.message : 'Something went wrong. Try again?';
  }

  diagnoseBtn.addEventListener('click', async function(){
    hideError();
    var text = textInput.value.trim();
    if (!text){ showError('Paste some text first. The meter needs something to judge.'); return; }
    if (!BACKEND_READY){ showError(friendlyError()); return; }

    diagnoseBtn.disabled = true; diagnoseLoading.classList.add('show'); resultBox.classList.remove('show');
    try {
      var res = await fetch(BACKEND_URL + '/brainrot/diagnose', {
        method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ text: text })
      });
      var data = await res.json().catch(function(){ return null; });
      if (!res.ok) throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      renderResult(data);
    } catch (e) {
      showError(friendlyError(e));
    } finally {
      diagnoseBtn.disabled = false; diagnoseLoading.classList.remove('show');
    }
  });

  function renderResult(data){
    var score = Math.max(0, Math.min(100, Math.round(data.score || 0)));
    document.getElementById('scoreNum').innerHTML = score + '<sub>/100</sub>';
    document.getElementById('tierName').textContent = data.tier || '';
    document.getElementById('meterMarker').style.left = score + '%';
    document.getElementById('roastText').textContent = data.roast || '';
    document.getElementById('tipText').textContent = data.recoveryTip || '';
    resultBox.classList.add('show');
  }

  translateBtn.addEventListener('click', async function(){
    hideError();
    var text = textInput.value.trim();
    if (!text){ showError('Paste some text first. Nothing to translate yet.'); return; }
    if (!BACKEND_READY){ showError(friendlyError()); return; }

    translateBtn.disabled = true;
    translateWrap.style.display = 'block';
    translateBox.innerHTML = '<span class="cursor-blink"></span>';

    try {
      var res = await fetch(BACKEND_URL + '/brainrot/translate', {
        method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ text: text })
      });
      if (!res.ok){
        var errData = await res.json().catch(function(){ return null; });
        throw new Error((errData && errData.error) || ('Request failed (' + res.status + ')'));
      }
      await streamAnthropicSSE(res, function(delta){
        translateBox.textContent += delta;
      });
      // remove any leftover cursor once done
    } catch (e) {
      showError(friendlyError(e));
      translateWrap.style.display = 'none';
    } finally {
      translateBtn.disabled = false;
    }
  });

  // Parses Anthropic's raw SSE stream (proxied through unchanged by the Worker)
  // and calls onDelta(text) for every content_block_delta text chunk.
  async function streamAnthropicSSE(res, onDelta){
    var reader = res.body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    var first = true;
    while (true){
      var chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      var events = buffer.split('\n\n');
      buffer = events.pop(); // keep the last (possibly incomplete) event
      for (var i = 0; i < events.length; i++){
        var lines = events[i].split('\n');
        for (var j = 0; j < lines.length; j++){
          var line = lines[j];
          if (line.indexOf('data:') !== 0) continue;
          var payload = line.slice(5).trim();
          if (!payload) continue;
          var evt;
          try { evt = JSON.parse(payload); } catch(e){ continue; }
          if (evt.type === 'content_block_delta' && evt.delta && evt.delta.type === 'text_delta'){
            if (first){ translateBox.textContent = ''; first = false; }
            onDelta(evt.delta.text);
          }
        }
      }
    }
  }

  document.getElementById('copyTranslate').addEventListener('click', function(){
    navigator.clipboard.writeText(translateBox.textContent).then(function(){
      var b = document.getElementById('copyTranslate');
      var old = b.textContent; b.textContent = '✅ Copied!';
      setTimeout(function(){ b.textContent = old; }, 1500);
    });
  });
})();
