document.addEventListener("DOMContentLoaded", function() {
	var socket = io();
	window.socket = socket;
	window.__tempZone = window.__tempZone || 'normal';

	const url = new URL (document.URL)
	var path = url.pathname
	var adds = false
	if (path == '/parameters') {
		adds = true
		//console.log(adds)
	}

// ---- UI helper: DHW card can be disabled via config (SETTINGS$dhwuse) ----
function dhwUiDisabled() {
  const card = document.getElementById('dhw-card');
  return !!(card && card.classList.contains('dhw-disabled'));
}

// ---- Formatting helper for Parameters: always show 1 decimal place (e.g., 20.0) ----
function fmt1(val) {
  // Returns a string with 1 decimal place, or "N.A" if value is not a valid number.
  if (val === null || val === undefined) return "N.A";
  const s = String(val).trim();
  if (s === "" || s.toUpperCase() === "N.A" || s.toLowerCase() === "nan") return "N.A";
  const num = Number(s);
  if (!Number.isFinite(num)) return s;   // keep original for non-numeric states like "ERR"
  return num.toFixed(1);
}

// ---- Color helpers: Superheat/Subcooling health bands (HVAC-friendly defaults) ----
// NOTE: thresholds are practical for inverter monoblock + R32; you can tweak later.
/**
 * Thresholds (K) tuned for inverter monoblock R32 (practical/service ranges)
 * CO (CH):  SH <5 blue | 5-12 green | >12 red
 *           SC <3 blue | 3-10 green | >10 red
 * CWU (DHW): SH <6 blue | 6-15 green | >15 red
 *            SC <4 blue | 4-12 green | >12 red
 */
function hvacModeFromThreeway() {
  const tw = (lastThreeway !== null && lastThreeway !== undefined) ? String(lastThreeway).toUpperCase() : "";
  if (!tw) return null;
  // During defrost PyHaier reports ERR for the 3-way valve; do NOT treat that as CH.
  if (tw.includes("ERR")) return null;
  if (tw.includes("DHW") || tw.includes("CWU")) return "DHW";
  if (tw.includes("CH") || tw.includes("CO") || tw.includes("HEAT")) return "CH";
  return null;
}

function hvacRunning() {
  // Consider the refrigeration circuit "running" when compressor frequency (fact) > 0
  const hz = (typeof compinfo !== "undefined" && compinfo && compinfo.length) ? Number(compinfo[0]) : 0;
  return (Number.isFinite(hz) && hz > 0);
}

function shColorK_CH(v) {
  if (!Number.isFinite(v)) return "#999";
  if (v < 5) return "#1e90ff";      // blue
  if (v <= 12) return "#2e8b57";    // green
  return "#d32f2f";                 // red
}
function scColorK_CH(v) {
  if (!Number.isFinite(v)) return "#999";
  if (v < 3) return "#1e90ff";
  if (v <= 10) return "#2e8b57";
  return "#d32f2f";
}

function shColorK_DHW(v) {
  if (!Number.isFinite(v)) return "#999";
  if (v < 6) return "#1e90ff";
  if (v <= 15) return "#2e8b57";
  return "#d32f2f";
}
function scColorK_DHW(v) {
  if (!Number.isFinite(v)) return "#999";
  if (v < 4) return "#1e90ff";
  if (v <= 12) return "#2e8b57";
  return "#d32f2f";
}

function shColorK(v) {
  return (hvacModeFromThreeway() === "DHW") ? shColorK_DHW(v) : shColorK_CH(v);
}
function scColorK(v) {
  return (hvacModeFromThreeway() === "DHW") ? scColorK_DHW(v) : scColorK_CH(v);
}

function paintValue($el, color) {
  if (!$el || !$el.length) return;
  if (!color) {
    $el.css("color", "");
    $el.css("font-weight", "");
    return;
  }
  $el.css("color", color);
  $el.css("font-weight", "600");
}


function fmtAgeSimple(timeMin) {
  if (timeMin === null || timeMin === undefined) return "?";
  const m = Number(timeMin);
  if (!isFinite(m)) return "?";
  if (m < 60) return String(Math.round(m)) + " min";
  if (m < 24 * 60) return String(Math.max(1, Math.round(m / 60))) + " h";
  return String(Math.max(1, Math.round(m / (24 * 60)))) + " d";
}


// ---- i18n helper (i18next, safe fallback) ----
function t(key, fallback, opts) {
  try {
    if (window.i18next && typeof window.i18next.t === 'function') {
      const o = Object.assign({ defaultValue: fallback }, opts || {});
      return window.i18next.t(key, o);
    }
  } catch (e) {}
  return fallback;
}

// ---- UI helper: temperature status (fallback / stale) ----
let lastIntempStatus = "ok";
let lastIntempValue = null;

let lastOuttempStatus = "ok";
let lastIntempSrc = null;
let lastOuttempSrc = null;
let lastIntempTimeMin = null;
let lastOuttempTimeMin = null;

function applyTempStatusUI() {
  const iEl = $("#intemp");
  const oEl = $("#outtemp");

  function applyTo($el, status, src, timeMin, keyName) {
    if (!$el || !$el.length) return;

    // clear previous state
    $el.removeClass("temp-forced temp-outdated");

    const st = String(status || "ok").toLowerCase();
    const s = String(src || "").toLowerCase();

    if (st === "forced") $el.addClass("temp-forced");
    if (st === "outdated") $el.addClass("temp-outdated");

    // Special case: emergency inside temp shows "Awaria" and blinks (handled by CSS on temp-outdated)
    if (keyName === "intemp" && s === "emergency") {
      $el.addClass("temp-outdated");
    }

    // Tooltip: status + source + time (multiline)
    const showSrc = (() => {
      // Collapse local sensors into a single UI label
      if (s === "ds18b" || s === "dht22") return "builtin";
      if (s === "ha") return "ha";
      if (s === "tao") return "tao";
      if (s === "cache") return "cache";
      if (s === "missing") return "missing";
      if (s === "emergency") return "emergency";
      return src || "N.A";
    })();

    const readingLabel = t('temp.tooltip.reading', 'reading');
    const sourceLabel = t('temp.tooltip.source', 'source');
    const timeLabel = t('temp.tooltip.time', 'time');

    const statusLabel = t('temp.status.' + st, st);
    const sourceVal = t(String(showSrc), String(showSrc));
    const tlabel = fmtAgeSimple(timeMin);

    const tooltip = readingLabel + ': ' + statusLabel + "\n" +
                    sourceLabel + ': ' + sourceVal + "\n" +
                    timeLabel + ': ' + tlabel;
    $el.attr("title", tooltip);
  }

  applyTo(iEl, lastIntempStatus, lastIntempSrc, lastIntempTimeMin, "intemp");
  applyTo(oEl, lastOuttempStatus, lastOuttempSrc, lastOuttempTimeMin, "outtemp");
}

function renderIntemp(adds) {
  const el = $("#intemp");
  if (!el.length) return;

  const st = String(lastIntempStatus || "ok").toLowerCase();
  const src = String(lastIntempSrc || "").toLowerCase();

  // If source reports emergency, keep original behavior
  if (src === "emergency") {
    el.text(t('temp.emergency_value', 'Emergency'));
    const unit = $("#intemp_unit");
    if (unit.length) unit.hide();
    return;
  }

  const unit = $("#intemp_unit");

  // Treat null/empty/"nan"/"N.A" as missing (avoid Number(null) === 0)
  const raw = lastIntempValue;
  const s = (raw === null || raw === undefined) ? "" : String(raw).trim();
  if (s === "" || s.toLowerCase() === "nan" || s.toUpperCase() === "N.A") {
    el.text("N.A");
    if (unit.length) unit.hide();
    return;
  }

  const num = Number(s);
  if (Number.isFinite(num)) {
    // On the dashboard we use a separate unit element (#intemp_unit), so keep it visible.
    if (unit.length) unit.show();
    el.text(num.toFixed(1) + (adds ? "°C" : ""));
  } else {
    // keep backend state like "ERR", etc.
    el.text(s);
    if (unit.length) unit.show();
  }
}


// Refresh translated labels on language change (tooltips / emergency label)
try {
  if (window.i18next && typeof window.i18next.on === 'function') {
    window.i18next.on('languageChanged', function () {
      applyTempStatusUI();
      renderIntemp(adds);
    });
  }
} catch (e) {}


// ---- UI helpers: active mode highlight (Quiet/Eco/Turbo) + frequency limit label ----
  function setActiveMode(mode) {
    const ids = ["quiet", "eco", "turbo"];
    const names = { quiet: "Quiet", eco: "Eco", turbo: "Turbo" };

    // Remove highlight classes
    ids.forEach(id => { const el = $("#"+id); if (el.length) el.removeClass("mode-active"); });
    ids.forEach(id => { const el = $("#"+id+"-label"); if (el.length) el.removeClass("mode-active"); });

    // Reset any old HTML (<b><u>...) back to plain text
    for (const [id, label] of Object.entries(names)) {
      const el = $("#"+id); if (el.length) el.text(label);
      const lab = $("#"+id+"-label"); if (lab.length) lab.text(label);
    }

    // Highlight active one
    if (ids.includes(String(mode))) {
      const el = $("#"+mode); if (el.length) el.addClass("mode-active");
      const lab = $("#"+mode+"-label"); if (lab.length) lab.addClass("mode-active");
    }
  }

  function setFreqLimitActive(on) {
    const lab = $("#flimiton-label");
    if (!lab.length) return;
    if (String(on) === "1") lab.addClass("mode-active");
    else lab.removeClass("mode-active");
  }

// ---- UI helper: show Δt only when compressor works AND three-way valve is in CH ----
let lastThreeway = null;
let lastHeatDemand = "0";
let lastPch = "off";
let lastPdhw = "off";
function updateDeltaVisibility() {
  const deltaEl = $("#delta");
  if (!deltaEl.length) return; // element exists only on main dashboard (antionoff card)
  const wrap = deltaEl.closest("span"); // <span>Δt = <b id="delta">...</b> °C</span>

  // Respect temperature zones: in Frost/Warm UI we show an icon instead of Δt
  const tz = String(window.__tempZone || "normal").toLowerCase();
  if (tz === "frost" || tz === "warm") {
    if (wrap.length) wrap.hide();
    return;
  }

  const compHz = (typeof compinfo !== "undefined" && compinfo && compinfo.length) ? Number(compinfo[0]) : 0;
  const tw = (lastThreeway !== null && lastThreeway !== undefined) ? String(lastThreeway).toUpperCase() : "";
  const rawDelta = String(deltaEl.text() || "").trim();
  const deltaNum = Number(rawDelta.replace(',', '.'));
  const hasDelta = Number.isFinite(deltaNum);
  const shouldShow = hasDelta && (compHz > 0) && (tw === "CH");
  if (wrap.length) wrap.toggle(shouldShow);
}

// ---- UI helper: update fire icons (CH/DHW) dynamically based on lastThreeway + compressor Hz ----
function refreshFireIcons() {
  // If we don't know the three-way position yet, keep both idle
  const twRaw = (lastThreeway !== null && lastThreeway !== undefined) ? String(lastThreeway).toUpperCase() : "";
  if (!twRaw) {
    updateFireStatus("ch", "firestatus.idle");
    updateFireStatus("dhw", "firestatus.idle");
    return;
  }

  const running = hvacRunning();
  const mode = hvacModeFromThreeway(); // "CH" or "DHW" (or null on ERR/unknown)

  if (mode === "CH") {
    // Avoid "false blinking" during switchover / pump-down: require actual heat demand
    const demand = String(lastHeatDemand) === "1";
    const enabled = String(lastPch).toLowerCase() === "on";
    const heating = running && enabled && demand;

    updateFireStatus("ch",  heating ? "firestatus.heating" : "firestatus.idle");
    updateFireStatus("dhw", "firestatus.idle");
  } else if (mode === "DHW") {
    // For DHW we don't have a separate demand flag, so gate by DHW enable + compressor running
    const enabled = String(lastPdhw).toLowerCase() === "on";
    const heating = running && enabled;

    updateFireStatus("dhw", heating ? "firestatus.heating" : "firestatus.idle");
    updateFireStatus("ch",  "firestatus.idle");
  } else {
    updateFireStatus("ch",  "firestatus.idle");
    updateFireStatus("dhw", "firestatus.idle");
  }
}

// -------------------------------------------------------------------------------
socket.on('return', function(msg) {
                        console.log("RETURN")
                        console.log(msg)

		switch(Object.keys(msg)[0]) {
			case "curvecalc":
				appendAlert(msg.curvecalc, 'success');
				$("#hcurve").text(msg.curvecalc);
				$("#button-spinner").addClass("d-none");
				break;
			case "tempchange":
				appendAlert(msg.tempchange, msg.type);
				break;
			case "statechange":
                                if( msg.statechange == 'pch' || msg.statechange == 'pcool' || msg.statechange == 'off' ) {
                                $("#heat-loading-overlay")[0].classList.add("d-none")
                                } else if ( msg.statechange == 'pdhw' ) {
                $("#pdhw-loading-overlay")[0].classList.add("d-none")
                                }
		}
	});
if (path != '/settings') {
    socket.on('data_update', function(msg) {
		switch(Object.keys(msg)[0]) {
		case "restarted":
				if (msg.restarted == 1) {
					restartModal.hide()
					errorRestart.cancel()
					appendAlert("servicestart", "success")
					socket.emit("client", { 'restarted' : 0 })
				}
				break;
	    	case "twitwo":
    if (msg.twitwo && msg.twitwo.length >= 2) {
        const v1 = Number(msg.twitwo[0]);
        const v2 = Number(msg.twitwo[1]);

        $("#twi").text(
            Number.isFinite(v1) ? v1.toFixed(1) + (adds ? " °C" : "") : "N.A"
        );
        $("#two").text(
            Number.isFinite(v2) ? v2.toFixed(1) + (adds ? " °C" : "") : "N.A"
        );

        if (Number.isFinite(v1) && Number.isFinite(v2)) {
            $("#deltat").text((v2 - v1).toFixed(1) + (adds ? " °C" : ""));
        }
    }
    break;
			case "thitho":
				$("#thi").text((adds ? fmt1(msg.thitho[0]) : msg.thitho[0]) + (adds ? " °C" : ""))
        		$("#tho").text((adds ? fmt1(msg.thitho[1]) : msg.thitho[1]) + (adds ? " °C" : ""))
				break;
			case "pdps":
				$("#pdset").text((adds ? fmt1(msg.pdps[0]) : msg.pdps[0]) + (adds ? " bar" : ""))
				$("#pdact").text((adds ? fmt1(msg.pdps[1]) : msg.pdps[1]) + (adds ? " bar" : ""))
				$("#psset").text((adds ? fmt1(msg.pdps[2]) : msg.pdps[2]) + (adds ? " bar" : ""))
				$("#psact").text((adds ? fmt1(msg.pdps[3]) : msg.pdps[3]) + (adds ? " bar" : ""))
				break;
			case "tsatpd":
				$("#tsatpdset").text((adds ? fmt1(msg.tsatpd[0]) : msg.tsatpd[0]) + (adds ? " °C" : ""))
				$("#tsatpdact").text((adds ? fmt1(msg.tsatpd[1]) : msg.tsatpd[1]) + (adds ? " °C" : ""))
				break;
			case "tsatps":
				$("#tsatpsset").text((adds ? fmt1(msg.tsatps[0]) : msg.tsatps[0]) + (adds ? " °C" : ""))
				$("#tsatpsact").text((adds ? fmt1(msg.tsatps[1]) : msg.tsatps[1]) + (adds ? " °C" : ""))
				break;
			case "superheat":
				$("#superheat").text((adds ? fmt1(msg.superheat) : msg.superheat) + (adds ? " °C" : ""))
				if (hvacRunning()) { paintValue($("#superheat"), shColorK(Number(msg.superheat))); } else { paintValue($("#superheat"), null); }
				break;
			case "subcooling":
				$("#subcooling").text((adds ? fmt1(msg.subcooling) : msg.subcooling) + (adds ? " °C" : ""))
				if (hvacRunning()) { paintValue($("#subcooling"), scColorK(Number(msg.subcooling))); } else { paintValue($("#subcooling"), null); }
				break;
			case "firmware":
				{
				  const fw = msg.firmware;
				  if (fw === null || fw === undefined) $("#firmware").text("N.A");
				  else if (typeof fw === "number" && Number.isFinite(fw)) $("#firmware").text(fw.toFixed(1));
				  else $("#firmware").text(String(fw));
				}
				break;
			case "eevlevel":
				$("#eevlevel").text(msg.eevlevel+" °")
				break;
	    	case "compinfo":
				$("#fact").text(msg.compinfo[0] + (adds ? " Hz" : ""))
				$("#fset").text(msg.compinfo[1] + (adds ? " Hz" : ""))
				$("#ccurr").text(msg.compinfo[2] + (adds ? " A" : ""))
				$("#cvolt").text(msg.compinfo[3] + (adds ? " V" : ""))
				$("#ctemp").text((adds ? fmt1(msg.compinfo[4]) : msg.compinfo[4]) + (adds ? "°C" : ""))
				compinfo = msg.compinfo
				updateDeltaVisibility()
				refreshFireIcons();
				break;
			case "fans":
				$("#fan1").text(msg.fans[0] + (adds ? "RPM" : ""))
				$("#fan2").text(msg.fans[1] + (adds ? "RPM" : ""))
				break;
			case "tao":
				$("#tao").text((adds ? fmt1(msg.tao) : msg.tao) + (adds ? "°C" : ""))
				break;
			case "tdts":
				$("#td").text((adds ? fmt1(msg.tdts[0]) : msg.tdts[0]) + (adds ? "°C" : ""))
				$("#ts").text((adds ? fmt1(msg.tdts[1]) : msg.tdts[1]) + (adds ? "°C" : ""))
				break;
	    	case "pump":
				$("#pump").text(msg.pump.toLowerCase())
				$("#pump").attr("data-i18n", msg.pump.toLowerCase());
				break;
	    	case "threeway":
				// 3-way valve status (also used as DEFROST indicator)
				const twRaw = (msg.threeway !== undefined && msg.threeway !== null) ? String(msg.threeway) : "";
				const twLower = twRaw.toLowerCase();
				$("#threeway").text(twLower);
				$("#threeway").attr("data-i18n", twLower);
				// Subtle blue pulse during DEFROST (same vibe as mode-active)
				if (twRaw.toUpperCase() === "DEFROST") $("#threeway").addClass("defrost-pulse");
				else $("#threeway").removeClass("defrost-pulse");
				lastThreeway = twRaw;
				updateDeltaVisibility();
				refreshFireIcons();
				break;
	    	case "archerror":
				$("#archerror").text(msg.archerror)
				break;
	    	case "dtquiet":
				$("#deltatempquiet").text(fmt1(msg.dtquiet));
				break;
		    case "dtturbo":
				$("#deltatempturbo").text(fmt1(msg.dtturbo));
			break;
		    case "dtflimit":
				$("#deltatempflimit").text(fmt1(msg.dtflimit));
				break;
	    	case "aoodt":
        		$("#antionoffdeltatime").text(fmt1(msg.aoodt));
				break;
	    	case "delta":
				$("#delta").text(msg.delta);
				break;
		    case "flimiton":
				$("#flimiton").text(msg.flimiton)
				$("#flimitchange").val(msg.flimiton)
				switch (msg.flimiton) {
					case "0":
						$("#flrelay").text("off");
						$("#flrelay").attr("data-i18n", "off");
				break;
					case "1":
						$("#flrelay").text("on");
						$("#flrelay").attr("data-i18n", "on");
					break;
				}
				setFreqLimitActive(msg.flimiton);
				break;
		    case "tank":
				if (dhwUiDisabled()) break;
				$("#ttemp").text(fmt1(msg.tank) + (adds ? " °C" : ""));
				break;
		    case "hcurve": {
  const raw = msg.hcurve;
  const num = Number(raw);
  if (Number.isFinite(num)) {
    $("#hcurve").text(num.toFixed(1) + "°C");
  } else {
    // keep backend state like "N.A", "ERR", etc.
    $("#hcurve").text((raw === undefined || raw === null || raw === "" || String(raw).toLowerCase() === "nan") ? "N.A" : String(raw));
  }
  break;
}

		    case "dhw":
				if (dhwUiDisabled()) break;
				const dhwVal = parseFloat(msg.dhw);
				if (Number.isFinite(dhwVal)) {
					$("#dhwsetpoint").text(dhwVal.toFixed(1) + (adds ? " °C" : ""));
					if (!adds) {
						dhwsetpoint = dhwVal;
						$("#dhwtempval").val(dhwVal);
					}
				} else {
					$("#dhwsetpoint").text(msg.dhw + (adds ? " °C" : ""));
					if (!adds) {
						dhwsetpoint = msg.dhw;
						$("#dhwtempval").val(msg.dhw);
					}
				}
				break;
		    case "setpoint":
				$("#setpoint").text(fmt1(msg.setpoint) + (adds ? " °C" : ""));
				if (!adds) {
					$("#intempval").val(msg.setpoint)
					temp = msg.setpoint
				}
				break;
	    	case "intemp":
				lastIntempValue = msg.intemp;
				renderIntemp(adds);
				break;
	    	case "intemp_status":
	    			lastIntempStatus = msg.intemp_status;
	    			renderIntemp(adds);
					applyTempStatusUI();
	    			break;
case "intempsrc":
	    			lastIntempSrc = msg.intempsrc;
	    			applyTempStatusUI();
	    			break;
			case "intemptime":
				lastIntempTimeMin = msg.intemptime;
				applyTempStatusUI();
				break;
case "outtemp":
				$("#outtemp").text(fmt1(msg.outtemp));
				break;
			case "tempzone":
				window.__tempZone = String(msg.tempzone || msg.temp_zone || msg.zone || 'normal');
				break;
	    	case "outtemp_status":
	    			lastOuttempStatus = msg.outtemp_status;
	    			applyTempStatusUI();
	    			break;
case "outtempsrc":
	    			lastOuttempSrc = msg.outtempsrc;
	    			applyTempStatusUI();
	    			break;
			case "outtemptime":
				lastOuttempTimeMin = msg.outtemptime;
				applyTempStatusUI();
				break;
case "humid":
				const h = Number(msg.humid);
				$("#humid").text(Number.isFinite(h) ? (h.toFixed(1) + " %") : "N.A");
				break;
		    case "ltemp":
				$("#ltemp").text(msg.ltemp)
				break;
	    	case "antionoff":
				if(msg.antionoff == "1") {
				    $("#presetdiv").hide();
				    $("#antionoffdiv").show();
				}
				break;
	    	case "mode":
				$("#presetchange").val(msg.mode)
				$("#mode").text(msg.mode)
								setActiveMode(msg.mode);

				break;
		    case "presetquiet":
				$("#presetquiet").text(msg.presetquiet);
				break;
	    	case "presetturbo":
				$("#presetturbo").text(msg.presetturbo);
				break;
	    	case "presetch":
				if(msg.presetch == "manual") {
				    $("#presetchange").show()
				    $("#preset").text(" Auto")
				} else if ( msg.presetch == "auto") {
				    $("#presetauto").show();
				    $("#preset").text("Manual")
				}
				break;
		    case "fflimit":
				if(msg.fflimit == "manual") {
		    		$("#flimit").text("Manual")
				    $("#flimitchange").show()
				} else if (msg.fflimit == "auto"){
				    $("#flimitauto").show()
				    $("#flimit").text("Auto")
				}
				break;
		    case "heatingcurve":
				if(msg.heatingcurve == "directly" ) {
		    		minch=25
				    maxch=55
				} else {
				    minch=12
				    maxch=30
				}
				break;
	  	}
	

if (msg.threeway !== undefined && msg.threeway !== null) { lastThreeway = msg.threeway; }
if (msg.heatdemand !== undefined && msg.heatdemand !== null) { lastHeatDemand = String(msg.heatdemand); }
if (msg.pch !== undefined && msg.pch !== null) { lastPch = String(msg.pch).toLowerCase(); }
if (msg.pdhw !== undefined && msg.pdhw !== null) { lastPdhw = String(msg.pdhw).toLowerCase(); }
updateDeltaVisibility();

refreshFireIcons();
switch(msg.pch) {
        	case "on":
				if (!adds) {
					if ($("#firestatus")[0].classList.contains("bi-snow") == true ) {
						toggleCSSclasses($("#firestatus")[0], "bi-fire", "bi-snow")
						$("#powerheat").val("pch");
						$("#water-decrement-button").removeAttr('disabled');
						$("#water-increment-button").removeAttr('disabled');
					} else if ($("#firestatus")[0].classList.contains("bi-fire") == false) {
						$("#firestatus")[0].classList.add("bi-fire");
						$("#powerheat").val("pch");
						$("#water-decrement-button").removeAttr('disabled');
						$("#water-increment-button").removeAttr('disabled');
					}
				}
                break;
            case "off":
				//console.log(adds)
				if (!adds) {
					//console.log("no adds")
					if ($("#firestatus")[0].classList.contains("bi-fire") == true ) {
						$("#firestatus")[0].classList.remove("bi-fire");
					}
					$("#powerheat").val("off");
					$("#water-decrement-button").attr('disabled','disabled');
					$("#water-increment-button").attr('disabled','disabled');
				}
                break;
            default:
        }
        switch(msg.pcool) {
        	case "on":
				if (!adds) {
					if ($("#firestatus")[0].classList.contains("bi-fire") == true ) {
						toggleCSSclasses($("#firestatus")[0], "bi-fire", "bi-snow")
						$("#powerheat").val("pcool");
						$("#water-decrement-button").removeAttr('disabled');
						$("#water-increment-button").removeAttr('disabled');
					} else if ($("#firestatus")[0].classList.contains("bi-fire") == false) {
						$("#firestatus")[0].classList.add("bi-snow");
						$("#powerheat").val("pcool");
						$("#water-decrement-button").removeAttr('disabled');
						$("#water-increment-button").removeAttr('disabled');
					}
				}
            	break;
            case "off":
				if (!adds) {
					if ($("#firestatus")[0].classList.contains("bi-snow") == true ) {
						$("#firestatus")[0].classList.remove("bi-snow");
						$("#powerheat").val("off");
						$("#water-decrement-button").attr('disabled','disabled');
						$("#water-increment-button").attr('disabled','disabled');
					}
				}
                break;
            default:
        }
        switch(msg.pdhw) {
        	case "on":
						if (dhwUiDisabled()) break;
				if (!adds) {
					if ($("#dhwstatus")[0].classList.contains("bi-droplet-fill") == false ) {
						toggleCSSclasses($("#dhwstatus")[0], "bi-droplet-fill", "bi-power")
						$("#powerdhw").val("on");
						$("#dhw-decrement-button").removeAttr('disabled');
						$("#dhw-increment-button").removeAttr('disabled');
					}
				}
                break;
            case "off":
						if (dhwUiDisabled()) break;
				if (!adds) {
					if ($("#dhwstatus")[0].classList.contains("bi-droplet-fill") == true ) {
						toggleCSSclasses($("#dhwstatus")[0], "bi-droplet-fill", "bi-power")
						$("#powerdhw").val("off");
						$("#dhw-decrement-button").attr('disabled','disabled');
						$("#dhw-increment-button").attr('disabled','disabled');
					} else {
						$("#powerdhw").val("off");
						$("#dhw-decrement-button").attr('disabled','disabled');
						$("#dhw-increment-button").attr('disabled','disabled');
					}
				}
                break;
            default:
        }
	  //console.log(msg)
    });
} else {
	//console.log("settings");
	//console.log(socket);
setTimeout(() => {
  console.log(socket);
}, 3000);
}
});
