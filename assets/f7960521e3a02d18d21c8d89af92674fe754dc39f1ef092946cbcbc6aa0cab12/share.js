/* Official Kakao sharing is invoked only from an explicit click on the public page. */
var BulletinShare = (function () {
  'use strict';
  function message(c) {
    return '[' + c.church + ' ' + c.department + ' 소식]\n' + c.date + ' 주보를 안내드립니다.\n이번 주 말씀: ' + c.title + ' (' + c.scripture + ')\n' + (c.notice ? c.notice + '\n' : '') + c.url;
  }
  function card(c, image) {
    var link = {mobileWebUrl:c.url, webUrl:c.url};
    return {objectType:'feed', content:{title:c.date + ' · ' + c.church + ' ' + c.department + ' 소식', description:c.title, imageUrl:image, imageWidth:1200, imageHeight:650, link:link}, buttons:[{title:'이번 주 주보 보기',link:link}]};
  }
  function customCard(c, image) {
    var content = card(c, image).content, url = new URL(c.url);
    // Kakao's template editor inserts '/' before Path. Keep the complete weekly
    // repository path, without its leading slash, for every link including source.
    return {templateId:c.kakaoTemplateId, templateArgs:{TITLE:content.title, DESCRIPTION:content.description, IMAGE:image, PATH:url.pathname.replace(/^\//,'') + url.search}};
  }
  function start(win, doc, c) {
    var $ = function (id) { return doc.getElementById(id); }, button = $('kakao-preview'), image = '', readyAt = 0, loading = false, sdkPromise = null, previousFocus;
    var validUrl = function (url) { try { var u = new URL(url); return u.protocol === 'https:' && !u.username && !u.password; } catch (_) { return false; } };
    function status(text) { $('share-status').textContent = text; }
    function dialog(description, text) {
      previousFocus = doc.activeElement;
      $('dialog-description').textContent = description;
      $('manual-label').hidden = $('manual-copy').hidden = !text;
      $('manual-copy').value = text || '';
      if (typeof $('share-dialog').showModal === 'function') $('share-dialog').showModal();
      else $('share-dialog').setAttribute('open','');
      if (text) { $('manual-copy').focus(); $('manual-copy').select(); }
    }
    async function copy(text) {
      try {
        if (!win.navigator.clipboard || !win.navigator.clipboard.writeText) throw new Error('no clipboard');
        await win.navigator.clipboard.writeText(text); status('복사했습니다. 원하는 대화방에 붙여넣어 주세요.');
      } catch (_) { status('자동 복사가 되지 않아 수동 복사 내용을 표시했습니다.'); dialog('아래 내용을 선택해서 직접 복사해 주세요.',text); }
    }
    function timeout(promise, ms, stage) {
      return new Promise(function (resolve,reject) {
        var timer = win.setTimeout(function () { var e = new Error('응답 대기 시간이 지났습니다.'); e.stage = stage; reject(e); },ms);
        Promise.resolve(promise).then(function (v) { win.clearTimeout(timer); resolve(v); },function (e) { win.clearTimeout(timer); reject(e); });
      });
    }
    function sdk() {
      if (win.Kakao) return Promise.resolve(win.Kakao);
      if (sdkPromise) return sdkPromise;
      sdkPromise = timeout(new Promise(function (resolve,reject) {
        var script = doc.createElement('script');
        if (!c.sdk || !/^https:\/\/t1\.kakaocdn\.net\/kakao_js_sdk\/\d+\.\d+\.\d+\/kakao\.min\.js$/.test(c.sdk.src) || !/^sha384-[A-Za-z0-9+/=]+$/.test(c.sdk.integrity)) { reject(new Error('SDK 설정 오류')); return; }
        script.src = c.sdk.src; script.integrity = c.sdk.integrity; script.crossOrigin = 'anonymous'; script.async = true;
        script.onload = function () { if (win.Kakao) resolve(win.Kakao); else reject(new Error('SDK 초기화 파일이 없습니다.')); };
        script.onerror = function () { script.remove(); reject(new Error('SDK 파일을 불러오지 못했습니다.')); };
        doc.head.appendChild(script);
      }),10000,'sdk').catch(function () { sdkPromise = null; var e = new Error('SDK를 불러오지 못했습니다. 연결 상태를 확인하거나 복사를 이용해 주세요.'); e.stage = 'sdk'; throw e; });
      return sdkPromise;
    }
    function explain(error) {
      if (/domain|origin|도메인/i.test(String(error && error.message || ''))) return '등록 도메인 오류입니다. 운영자는 JavaScript SDK 도메인과 제품 링크 웹 도메인을 확인해 주세요. 복사는 계속 사용할 수 있습니다.';
      if (error && error.stage === 'sdk') return '카카오 SDK를 불러오지 못했습니다. 연결 상태를 확인하거나 링크·문구 복사를 이용해 주세요.';
      if (error && error.stage === 'init') return '카카오 JavaScript 키 초기화에 실패했습니다. 운영자에게 키 설정 확인을 요청하고 복사를 이용해 주세요.';
      return '공유 이미지 준비 또는 카카오 요청에 실패했습니다. 링크·문구 복사를 이용하거나 다시 시도해 주세요.';
    }
    async function prepare() {
      if (loading) return;
      loading = true; button.disabled = true; status('카카오 공유 이미지 준비 중입니다. 복사 버튼은 사용할 수 있습니다.');
      try {
        var k = await sdk();
        try { if (!k.isInitialized()) k.init(c.kakaoKey); } catch (_) { var e = new Error('키 초기화 실패'); e.stage = 'init'; throw e; }
        var response = await timeout(k.Share.scrapImage({imageUrl:c.image}),15000,'image');
        var prepared = response && response.infos && response.infos.original && response.infos.original.url;
        if (/^http:\/\/[a-z0-9.-]+\.kakaocdn\.net\//i.test(prepared || '')) prepared = prepared.replace(/^http:/i,'https:');
        if (!validUrl(prepared)) throw new Error('이미지 준비 결과 오류');
        image = prepared; readyAt = Date.now(); status('이미지가 준비됐습니다. 카카오톡 공유를 다시 눌러 대화방을 선택해 주세요.');
      } catch (e) { image = ''; status(explain(e)); }
      finally { loading = false; button.disabled = false; }
    }
    function share() {
      if (!c.kakaoKey) { status('카카오 JavaScript 키가 아직 설정되지 않았습니다. 주보 링크 또는 안내 문구 복사를 이용해 주세요.'); return; }
      if (!validUrl(c.url) || !validUrl(c.image)) { status('공개 주소 또는 표지 주소를 확인할 수 없습니다. 운영자에게 게시 설정 확인을 요청해 주세요.'); return; }
      // Fresh scrape on each page visit, and again after an hour. Never persist expiring Kakao URLs.
      if (!image || Date.now() - readyAt >= 3600000) return prepare();
      try {
        // The SDK has no delivery Promise contract. Keep send failures visible;
        // never fall back from custom to the default template's root source link.
        if (c.kakaoTemplateId) win.Kakao.Share.sendCustom(customCard(c,image));
        else win.Kakao.Share.sendDefault(card(c,image));
        status('카카오 공유 화면에서 대화방을 선택해 주세요. 창이 열리지 않으면 도메인 설정을 확인하거나 복사를 이용해 주세요. 전송 완료 여부는 이 화면에서 확인하지 않습니다.');
      } catch (e) { image = ''; status(explain(e)); }
    }
    $('copy-link').addEventListener('click',function () { copy(c.url); });
    $('copy-message').addEventListener('click',function () { copy(message(c)); });
    button.addEventListener('click',share);
    $('close-dialog').addEventListener('click',function () { if ($('share-dialog').close) $('share-dialog').close(); else $('share-dialog').removeAttribute('open'); if (previousFocus && previousFocus.focus) previousFocus.focus(); });
    return {share:share, copyLink:function () { return copy(c.url); }, copyMessage:function () { return copy(message(c)); }};
  }
  return {message:message,card:card,customCard:customCard,start:start};
})();
if (typeof module !== 'undefined') module.exports = BulletinShare;
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  var shareData = document.getElementById('bulletin-share-data');
  if (shareData) {
    try { BulletinShare.start(window,document,JSON.parse(shareData.textContent)); }
    catch (_) { var status = document.getElementById('share-status'); if (status) status.textContent = '공유 설정을 읽지 못했습니다. 주소창의 주차별 주소를 직접 복사해 주세요.'; }
  }
}
