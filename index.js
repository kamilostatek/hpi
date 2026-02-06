/* === Inline scripts extracted from templates (split) === */
(function(){
  'use strict';
  const PAGE = (document.body && document.body.dataset) ? (document.body.dataset.page || '') : '';
  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // From templates/index.html (block 1)
  onReady(function(){
    if(!(PAGE === 'index')) return;
    try {
function modechange(newmode) {
                $.post('/modechange', {newmode}, function(data) {
                        var text=data.msg;
                        var state=data.state
                        Swal.fire({
                                html: text,
                                icon: state,
                                showCloseButton: false,
                                showConfirmButton: false,
                                timer: 2000,
                                timerProgressBar: true,
                                didOpen: () => {
                        const b = Swal.getHtmlContainer().querySelector('b')
                        timerInterval = setInterval(() => {
                            b.textContent = Swal.getTimerLeft()
                        }, 100)
                    },
                    willClose: () => {
                        clearInterval(timerInterval)
                    }
                                                })
                        });
			}
        function flrchange(newmode) {
                $.post('/flrchange', {newmode}, function(data) {
                        var text=data.msg;
                        var state=data.state
                        Swal.fire({
                                html: text,
                                icon: state,
                                showCloseButton: false,
                                showConfirmButton: false,
                                timer: 2000,
                                timerProgressBar: true,
                                didOpen: () => {
                        const b = Swal.getHtmlContainer().querySelector('b')
                        timerInterval = setInterval(() => {
                            b.textContent = Swal.getTimerLeft()
                        }, 100)
                    },
                    willClose: () => {
                        clearInterval(timerInterval)
                    }
                                                })
                        });
                        }

        function statechange(mode, value) {
		if (mode == "pdhw") {
			$("#"+mode+"-loading-overlay")[0].classList.remove("d-none")
		} else {
			$("#heat-loading-overlay")[0].classList.remove("d-none")
		}
            $.post('/statechange', {mode: mode, value: value}, function(data) {
                var text=data.msg;
                var state=data.state;
		appendAlert(text, state);
                if (mode == "pdhw") {
                        $("#"+mode+"-loading-overlay")[0].classList.add("d-none")
                } else {
                        $("#heat-loading-overlay")[0].classList.add("d-none")
                }

            });
        }
	function tchange(which,temp, direct) {
	//$.post('/tempchange', {which: which, value: temp, directly: direct}, function(data) {
        //                var text=data.msg;
         //               var state=data.state;
	//		appendAlert(text, state);
         //               });
		socket.emit("client", {tempchange:which, value:temp, directly:direct})
				}
/*        function tempchange(which, directly) {
        if (which ==  "heat") {
            minimum=minch
            maximum=maxch
            stepp=0.1
            inputval=temp
        }
        if (which == "dhw") {
            minimum=30
            maximum=55
            stepp=1
            inputval=dhwsetpoint
        }
            (async () => {
                const { value: inputValue } = await Swal.fire({
					title: "{{ _('Change temperature') }}",
                    input: 'range',
                    inputAttributes: {
                        min: minimum,
                        max: maximum,
                        step: stepp
                    },
                    inputValue: inputval
                })
                if (confirm) {
                    $("#"+which)[0].classList.add("spinn")
                    $("#"+which)[0].classList.add("iconspinner")
                    var data = inputValue
                    $.post('/tempchange', {which: which, value: data, directly: directly}, function(data) {
                        var text=data.msg;
                        var state=data.state
                        Swal.fire({
                            html: text,
                            icon: state,
                            showCloseButton: false,
                            showConfirmButton: false,
                            timer: 2000,
                            timerProgressBar: true,
                            didOpen: () => {
                                const b = Swal.getHtmlContainer().querySelector('b')
                                timerInterval = setInterval(() => {
                                    b.textContent = Swal.getTimerLeft()
                                }, 100)
                            },
                            willClose: () => {
                                clearInterval(timerInterval)
                            }
                        })
                    $("#"+which)[0].classList.remove("spinn")
                    $("#"+which)[0].classList.remove("iconspinner")
                    });
                }


            })()
        }*/


        //setInterval(getdata, 2000);
    } catch(e) { console.error('HPI inline script error (index.html #1)', e); }
  });

  // From templates/index.html (block 2)
  onReady(function(){
    if(!(PAGE === 'index')) return;
    try {
$(document).ready(function () {
				translateElement("flrelay");
translateElement("pump");
translateElement("threeway");
  $("#powerheat").change(function () {
	                //if (mode == "pdhw") {
                        $("#heat-loading-overlay")[0].classList.remove("d-none")
                        //$("#heat-loading-overlay")[0].classList.remove("d-none")
			socket.emit('client', {mode: $(this).val(), value: 'on'})
           /* $.post('/statechange', {mode: mode, value: value}, function(data) {
                var text=data.msg;
                var state=data.state;
                appendAlert(text, state);
                if (mode == "pdhw") {
                        $("#"+mode+"-loading-overlay")[0].classList.add("d-none")
                } else {
                        $("#heat-loading-overlay")[0].classList.add("d-none")
                }

            });*/

			  });
  // Obsługa kliknięcia przycisku
  $("#curvecalc-btn").click(function () {
	$("#hcurve").text("Obliczanie...");
	$("#button-spinner").removeClass("d-none");
    socket.emit('client', { curvecalc: 'curvecalc' });
    // Zmień zawartość przycisku na kręcące się kółko
/*    $("#hcurve").text("Obliczanie..."); // Zmień tekst
    $("#button-spinner").removeClass("d-none"); // Pokaż spinner
    // Wyślij żądanie GET na endpoint /curvecalc
    $.get("/curvecalc", function (data) {
      // Obsłuż odpowiedź
      console.log("Odpowiedź z serwera:", data);
	appendAlert(data.msg, 'success');
      // Przywróć oryginalną zawartość przycisku
      $("#hcurve").text(data.msg);
      $("#button-spinner").addClass("d-none"); // Ukryj spinner
    }).fail(function (error) {
      // Obsłuż błąd
      console.error("Błąd podczas wysyłania żądania:", error);
	appendAlert(error, 'danger')
      // Przywróć oryginalną zawartość przycisku
      $("#button-text").text("Oblicz krzywą");
      $("#button-spinner").addClass("d-none"); // Ukryj spinner

      // Opcjonalnie: Wyświetl komunikat o błędzie
 //     alert("Wystąpił błąd podczas obliczania krzywej.");
	appendAlert("Wystąpił nieoczekiwany błąd", 'danger')
    }); */
  });
});
    } catch(e) { console.error('HPI inline script error (index.html #2)', e); }
  });

  // From templates/index.html (block 3)
  onReady(function(){
    if(!(PAGE === 'index')) return;
    try {
(function () {
  // Try to determine flimit mode ('auto' / 'manual') as robustly as possible.
  let lastFlimitMode = null;
  let lastPresetAutoChange = null; // 'auto' or 'manual'

  // Temperature zone (normal / frost / warm)
  let lastTempZone = 'normal';

  function pickTempZoneFromData(data) {
    if (!data) return null;
    const candidates = [
      data.tempzone,
      data.temp_zone,
      data.zone,
      data.temperaturezone,
      data.temperature_zone,
      (data.settings && (data.settings.tempzone || data.settings.temp_zone || data.settings.zone))
    ];
    for (const c of candidates) {
      const v = norm(c);
      if (v) return v;
    }
    // Last resort: any key that contains 'tempzone'
    for (const [k, v] of Object.entries(data)) {
      if (typeof k === 'string' && k.toLowerCase().includes('tempzone')) {
        const nv = norm(v);
        if (nv) return nv;
      }
    }
    return null;
  }

  function t(key, fallback) {
    try {
      if (window.i18next && typeof window.i18next.t === 'function') return window.i18next.t(key);
    } catch (e) {}
    return fallback;
  }

  function applyAoodZoneUI(zone, antiOnOffOn) {
    const z = norm(zone) || 'normal';
    const isZone = (z === 'frost' || z === 'warm');

    // Keep socket.js in sync (it hides the Δt span when zone is active)
    window.__tempZone = z;

    const titleEl = document.getElementById('aood-title');
    const deltaWrap = document.getElementById('aood-delta-wrap');
    const zoneWrap = document.getElementById('aood-zone-wrap');
    const zoneIcon = document.getElementById('aood-zone-icon');
    const zoneBi = document.getElementById('aood-zone-bi');

    if (titleEl) {
      if (isZone && antiOnOffOn) {
        titleEl.textContent = (z === 'frost') ? t('set.zone_frost', 'Strefa mrozu') : t('set.zone_warm', 'Strefa ciepła');
      } else {
        titleEl.textContent = t('ind.aood', 'Tryb Anty ON-OFF "Delta"');
      }
    }

    // Right side: Δt vs icon
    if (deltaWrap && isZone && antiOnOffOn) { deltaWrap.style.display = 'none'; }
    if (deltaWrap && !(isZone && antiOnOffOn)) { deltaWrap.style.display = ''; }
    if (zoneWrap) zoneWrap.classList.toggle('d-none', !(isZone && antiOnOffOn));

    if (zoneIcon) {
      zoneIcon.classList.toggle('frost', (z === 'frost'));
      zoneIcon.classList.toggle('warm', (z === 'warm'));
    }
    if (zoneBi) {
      zoneBi.className = 'bi ' + ((z === 'frost') ? 'bi-thermometer-snow' : 'bi-thermometer-sun');
    }
    if (zoneWrap) {
      zoneWrap.title = (z === 'frost') ? t('set.zone_frost', 'Strefa mrozu') : (z === 'warm' ? t('set.zone_warm', 'Strefa ciepła') : '');
    }

    // Hide delta conditions + delta time row in zones (keep only mode labels)
    const hide = (isZone && antiOnOffOn);
    document.querySelectorAll('.aood-hide-in-zone').forEach(el => {
      el.style.display = hide ? 'none' : '';
    });
  }

  function norm(v) {
    if (v === undefined || v === null) return null;
    return String(v).toLowerCase().trim();
  }

  

  // Heating curve (for Set Temperature label switching)
  let lastHeatingCurve = null;

  function pickHeatingCurveFromData(data) {
    if (!data) return null;
    const candidates = [
      // Prefer the live status field returned by /getdata or data_update
      data.heatingcurve,
      data.hcurve,
      data.heatingCurve,
      // Fallbacks / legacy keys
      data["SETTINGS$heatingcurve"],
      data["SETTINGS_heatingcurve"],
      data.settings_heatingcurve,
      data.settingsHeatingCurve
    ];
    for (const c of candidates) {
      const v = norm(c);
      if (v) return v;
    }
    // As a last resort, search any key that includes 'heatingcurve'
    for (const [k, v] of Object.entries(data)) {
      if (typeof k === "string" && k.toLowerCase().includes("heatingcurve")) {
        const nv = norm(v);
        if (nv) return nv;
      }
    }
    if (data.settings && typeof data.settings === "object") {
      return pickHeatingCurveFromData(data.settings);
    }
    return null;
  }

    function applySetTempLabel(heatingCurve) {
    const insideLabel = document.getElementById("settemp-label-inside");
    const chLabel = document.getElementById("settemp-label-ch");
    if (!insideLabel || !chLabel) return;

    const v = norm(heatingCurve) || "";
    // Your API returns: heatingcurve:"directly"
    const isDirect = (v === "directly" || v === "direct");

    // Export step + limits globally so +/- uses correct granularity (0.1 vs 0.5) and bounds (30 vs 55)
    window.__heatingCurve = v;

    if (isDirect) {
      window.__heatStep = 0.5;
      window.__heatMin  = 25;
      window.__heatMax  = 55;
      window.minch = 25;
      window.maxch = 55;

      insideLabel.classList.add("d-none");
      chLabel.classList.remove("d-none");
    } else {
      window.__heatStep = 0.1;
      window.__heatMin  = 12;
      window.__heatMax  = 30;
      window.minch = 12;
      window.maxch = 30;

      chLabel.classList.add("d-none");
      insideLabel.classList.remove("d-none");
    }
  }

  function pickInsideHumidityFromData(data) {
    if (!data) return null;
    const candidates = [
      data.humid,
      data.humidity,
      data.insidehumidity,
      data.insideHumidity,
      data["INSIDE$humidity"],
      data["INSIDE_humidity"]
    ];
    for (const c of candidates) {
      if (c === undefined || c === null || c === "") continue;
      const n = Number(c);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  }
function pickFlimitModeFromData(data) {
    if (!data) return null;

    // Most likely keys (depending on backend/socket.js)
    const candidates = [
      data.flimitmode,
      data.freqlimitmode,
      data.flimit,                 // sometimes carries 'auto'/'manual'
      data["SETTINGS$flimit"],
      data["SETTINGS_flimit"],
      data.settings_flimit,
      data.settingsFlimit
    ];

    for (const c of candidates) {
      const v = norm(c);
      if (v === "auto" || v === "manual") return v;
    }
    return null;
  }

  function pickPresetAutoChangeFromData(data) {
    if (!data) return null;
    const direct = [
      data["SETTINGS$presetautochange"],
      data.presetautochange,
      data.SETTINGS_presetautochange,
      data["presetautochange"],
    ];
    for (const v of direct) {
      const nv = norm(v);
      if (nv === "auto" || nv === "manual") return nv;
    }
    for (const [k, v] of Object.entries(data)) {
      if (typeof k === "string" && k.toLowerCase().includes("presetautochange")) {
        const nv = norm(v);
        if (nv === "auto" || nv === "manual") return nv;
      }
    }
    if (data.settings && typeof data.settings === "object") {
      return pickPresetAutoChangeFromData(data.settings);
    }
    return null;
  }


  function detectManualFromDOMFallback() {
    // Fallback: if the "auto" block is hidden, we assume MANUAL.
    const autoBlock = document.getElementById("flimitauto");
    if (!autoBlock) return null;
    const isHidden = (autoBlock.style.display === "none") || autoBlock.classList.contains("d-none");
    return isHidden ? "manual" : "auto";
  }

  function isAntiOnOffVisible() {
    const div = document.getElementById("antionoffdiv");
    if (!div) return false;
    return !(div.style.display === "none");
  }

  function applyUI(isAntiOnOffOn, flimitMode) {
    const mode = norm(flimitMode) || detectManualFromDOMFallback();
    const isManual = (mode === "manual");

    // 1) Wiersz "Temperatura załączania >" ma znikać gdy:
    //    - Anty ON-OFF ON
    //    - LUB flimit MANUAL
    const tempRow = document.getElementById("flimittemp-row");
    if (tempRow) tempRow.style.display = (isAntiOnOffOn || isManual) ? "none" : "";

    
    // 1b) Gdy Anty ON-OFF jest WYŁĄCZONE, pokaż zastępczo kafelek "Wybór trybu" (tryb od temperatury)
    const presetAutoDiv = document.getElementById("presetauto");
    // Zakresy temperatur pokazujemy tylko w trybie AUTO zmiany trybu.
    // Jeśli nie mamy informacji z backendu, to domyślnie traktujemy jako AUTO (żeby nic nie "znikło").
    const presetSelect = document.getElementById("presetchange");
    const presetSelectVisible = !!(presetSelect && presetSelect.style.display !== "none" && !presetSelect.classList.contains("d-none"));
    const isAutoChange = (lastPresetAutoChange === "auto" || lastPresetAutoChange === null);
    const showPresetAuto = (!isAntiOnOffOn) && isAutoChange && !presetSelectVisible;
    if (presetAutoDiv) presetAutoDiv.style.display = showPresetAuto ? "" : "none";

	  // 2) W kafelku "Ograniczenie częstotliwości":
	  //    - w MANUAL ma zostać TYLKO wybór WŁ/WYŁ => chowamy <span id="flimit">...</span>
	  //    - w AUTO pokazujemy "Anty On-Off" tylko gdy Anty ON-OFF faktycznie steruje (czyli AUTO)
	  //    - podczas aktywnej strefy mrozu/ciepła ukrywamy napis "Anty On-Off" (zostaje samo "Ograniczenie częstotliwości :")
	  const z = norm(lastTempZone) || 'normal';
	  const zoneActive = ((z === 'frost' || z === 'warm') && isAntiOnOffOn);
	  const flimitStatus = document.getElementById("flimit");
	  if (flimitStatus) {
	    if (isManual) {
	      flimitStatus.textContent = "";
	      flimitStatus.style.display = "none";
	    } else {
	      if (zoneActive && isAntiOnOffOn) {
	        flimitStatus.textContent = "";
	        flimitStatus.style.display = "none";
	      } else {
	        flimitStatus.style.display = "";
	        flimitStatus.textContent = isAntiOnOffOn ? "Anty On-Off" : "Auto";
	      }
	    }
	  }

    // 3) W kafelku "Tryb Anty ON-OFF "Delta"":
    //    - w MANUAL ukrywamy cały wiersz "Ograniczenie częstot. < ... °C"
    const flimitOnLabel = document.getElementById("flimiton-label");
    if (flimitOnLabel) {
      const row = flimitOnLabel.closest(".row");
      if (row) row.style.display = isManual ? "none" : "";
    }
  }

  function refresh(dataMaybe) {
    const modeFromData = pickFlimitModeFromData(dataMaybe);
    if (modeFromData) lastFlimitMode = modeFromData;

    const presetAutoChangeFromData = pickPresetAutoChangeFromData(dataMaybe);
    if (presetAutoChangeFromData) lastPresetAutoChange = presetAutoChangeFromData;

    const antiOnOffOn = (dataMaybe && dataMaybe.antionoff !== undefined)
      ? (String(dataMaybe.antionoff) === "1")
      : isAntiOnOffVisible();

    const tz = pickTempZoneFromData(dataMaybe);
    if (tz) lastTempZone = tz;

        

    const heatingCurveFromData = pickHeatingCurveFromData(dataMaybe);
    if (heatingCurveFromData) lastHeatingCurve = heatingCurveFromData;
    applySetTempLabel(lastHeatingCurve);

    const h = pickInsideHumidityFromData(dataMaybe);
    if (h !== null) {
      // Update both: existing #humid (cooling card) and new #humid_ch (heating card)
      const humidEl = document.getElementById("humid");
      if (humidEl) humidEl.textContent = h.toFixed(1);
      const humidChEl = document.getElementById("humid_ch");
      if (humidChEl) humidChEl.textContent = h.toFixed(1);
    }
// ==== WYBÓR TRYBU – temperatury i tytuł (jak w 1.39) ====
    if (dataMaybe) {
      // temperatury progowe dla trybu Auto (Quiet/Turbo)
      if (dataMaybe.presetquiet !== undefined) {
        const pq = document.getElementById("presetquiet");
        if (pq) pq.textContent = Number(dataMaybe.presetquiet).toFixed(1);
      }
      if (dataMaybe.presetturbo !== undefined) {
        const pt = document.getElementById("presetturbo");
        if (pt) pt.textContent = Number(dataMaybe.presetturbo).toFixed(1);
      }

      // tytuł kafelka: zwykły wybór trybu vs od temperatury
      const autoChange =
        (dataMaybe["SETTINGS$presetautochange"] !== undefined ? dataMaybe["SETTINGS$presetautochange"] :
         (dataMaybe.presetautochange !== undefined ? dataMaybe.presetautochange :
          (dataMaybe["SETTINGS$presetauto"] !== undefined ? dataMaybe["SETTINGS$presetauto"] : undefined)));

      const titleEl = document.getElementById("preset-title");
      if (titleEl) {
        const v = (autoChange === undefined || autoChange === null) ? "" : String(autoChange).toLowerCase();
        titleEl.textContent = (v === "auto" || v === "1" || v === "true" || v === "on")
          ? "Wybór trybu od temperatury:"
          : "Wybór trybu:";
      }
    }

    applyUI(antiOnOffOn, lastFlimitMode);
    applyAoodZoneUI(lastTempZone, antiOnOffOn);
  }

  if (typeof socket !== "undefined" && socket && socket.on) {
    socket.on("data_update", function (data) {
      refresh(data);
    });
  }

  // Also keep the UI correct even if other scripts overwrite fields

  // Fallback: jeśli delta przychodzi w /getdata (HTTP), a nie w data_update,
  // to dociągnij ją okresowo i ustaw #delta.
  (function setupDeltaPoll() {
    const candidates = ["/getdata", "/api/getdata", "/get_data", "/data", "/status"];
    let goodUrl = null;

    async function tryFetch(url) {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      // Fallback updates from HTTP poll (in some setups socket data_update does not include all fields)
      try {
        const hc = pickHeatingCurveFromData(j);
        if (hc) {
          lastHeatingCurve = hc;
          applySetTempLabel(lastHeatingCurve);
        }
        const h = pickInsideHumidityFromData(j);
        if (h !== null) {
          const humidEl = document.getElementById("humid");
          if (humidEl) humidEl.textContent = h.toFixed(1);
          const humidChEl = document.getElementById("humid_ch");
          if (humidChEl) humidChEl.textContent = h.toFixed(1);
        }
      } catch (e) { /* ignore */ }

      // Temp zone fallback (for Frost/Warm UI)
      try {
        const tz = pickTempZoneFromData(j);
        if (tz) lastTempZone = tz;
        const antiOnOffOn = (j && j.antionoff !== undefined) ? (String(j.antionoff) === '1') : isAntiOnOffVisible();
        applyAoodZoneUI(lastTempZone, antiOnOffOn);
      } catch (e) { /* ignore */ }

      if (j && j.delta !== undefined && j.delta !== null) {
        const dv = Number(j.delta);
        if (!Number.isNaN(dv)) {
          lastDelta = dv;
          const dEl = document.getElementById("delta");
          if (dEl) dEl.textContent = dv.toFixed(1);
        }
      }
      return true;
    }

    async function tick() {
      try {
        if (goodUrl) {
          await tryFetch(goodUrl);
          return;
        }
        for (const u of candidates) {
          try {
            await tryFetch(u);
            goodUrl = u;
            return;
          } catch (e) { /* next */ }
        }
      } catch (e) { /* ignore */ }
    }

    setInterval(tick, 2000);
    tick();
  })();

  setInterval(function () { refresh(null); }, 400);
})();
    } catch(e) { console.error('HPI inline script error (index.html #3)', e); }
  });


})();
