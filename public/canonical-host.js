(function (global) {
  var APEX_HOST = "control.logitec.com.mx";
  var WWW_HOST = "www.control.logitec.com.mx";

  function shouldCanonicalizeHost(hostname) {
    return hostname === APEX_HOST;
  }

  function buildCanonicalUrl(loc) {
    if (!loc || !shouldCanonicalizeHost(loc.hostname)) return null;
    var pathname = loc.pathname || "/";
    var search = loc.search || "";
    var hash = loc.hash || "";
    return "https://" + WWW_HOST + pathname + search + hash;
  }

  function canonicalizeCloudHost(loc, replaceFn) {
    var target = loc || (typeof window !== "undefined" ? window.location : null);
    var url = buildCanonicalUrl(target);
    if (!url) return false;
    var replace = replaceFn;
    if (!replace && target && typeof target.replace === "function") {
      replace = function (next) {
        target.replace(next);
      };
    }
    if (typeof replace === "function") replace(url);
    return true;
  }

  global.LogitecCanonicalHost = {
    APEX_HOST: APEX_HOST,
    WWW_HOST: WWW_HOST,
    shouldCanonicalizeHost: shouldCanonicalizeHost,
    buildCanonicalUrl: buildCanonicalUrl,
    canonicalizeCloudHost: canonicalizeCloudHost
  };

  if (typeof window !== "undefined" && window.location) {
    canonicalizeCloudHost(window.location);
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
