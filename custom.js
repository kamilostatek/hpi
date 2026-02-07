
var waterdec = document.getElementById("water-decrement-button");
var waterinc = document.getElementById("water-increment-button");
var dhwdec = document.getElementById("dhw-decrement-button");
var dhwinc = document.getElementById("dhw-increment-button");

// --- Helpers: accept comma or dot decimals; display with dot (e.g. "43.0") ---
function parseCommaFloat(v){
  const s = String(v ?? '').trim().replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
function fmtComma1(n){
  if (!Number.isFinite(n)) return "N.A";
  return n.toFixed(1);
}

//var watertype = document.getElementById("water-type").value;
const toggleCSSclasses = (el, ...cls) => cls.map(cl => el.classList.toggle(cl))

function updateFireStatus(which, statusKey) {
    if ( which=="ch" ) {
    var fireStatusElement = document.getElementById("firestatus");
  if (!fireStatusElement) return;
    } else if ( which=="dhw" ) {
    var fireStatusElement = document.getElementById("dhwstatus");
  if (!fireStatusElement) return;
    }
	curstat=fireStatusElement.getAttribute("data-i18n")
	if (!curstat.includes(statusKey)) {
	if ( statusKey == "firestatus.heating" ) {
		fireStatusElement.classList.add('pulse', 'text-danger')
	} else {
		fireStatusElement.classList.remove('pulse', 'text-danger')
	}
    // Zapisz klucz tłumaczenia w `data-i18n`
    fireStatusElement.setAttribute("data-i18n", "[data-bs-title]"+statusKey);

    // Pobierz aktualne tłumaczenie
    const translatedText = i18next.t(statusKey);

    // Aktualizacja tooltipa Bootstrapa
    fireStatusElement.setAttribute("data-bs-title", translatedText);
    
    // Odśwież tooltip
    const tooltipInstance = bootstrap.Tooltip.getInstance(fireStatusElement);
    if (tooltipInstance) {
        tooltipInstance.dispose();
    }
    new bootstrap.Tooltip(fireStatusElement);
	}
}

let timer;
const debounce = (fn, delay) => {
  return (...args) => { // Zwróć funkcję, która przyjmuje dowolną liczbę argumentów
    clearTimeout(timer); // Anuluj poprzednio zaplanowaną funkcję, jeśli istnieje
    timer = setTimeout(() => { // Zaplanuj nową funkcję z podanym opóźnieniem
      fn.apply(this, args); // Wywołaj funkcję z podanymi argumentami
    }, delay);
  };
};

const sleepper = (fn, delay) => {
  let timer; // Przechowuje identyfikator timeoutu

  const debouncedFunction = (...args) => {
    clearTimeout(timer); // Anuluj poprzednio zaplanowaną funkcję, jeśli istnieje
    timer = setTimeout(() => {
      fn.apply(null, args); // Wywołaj funkcję z podanymi argumentami
    }, delay);
  };

  debouncedFunction.cancel = () => {
    clearTimeout(timer); // Anuluj zaplanowane wywołanie
  };

  return debouncedFunction;
};

// DHW setpoint: display with 1 decimal (43.0) but change by 1°C (pump expects integer setpoints).
const DHW_MIN = 30;
const DHW_MAX = 55;

function getDhwBase(){
  const cur = parseCommaFloat($('#dhwtempval').val());
  if (Number.isFinite(cur)) return cur;
  const fromSocket = Number(window.dhwsetpoint);
  if (Number.isFinite(fromSocket)) return fromSocket;
  return NaN;
}

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

// Heat setpoint helpers (0.1°C for indoor setpoint; 0.5°C for direct curve settemp)
function getHeatStep(){
  const s = Number(window.__heatStep);
  if (Number.isFinite(s) && s > 0) return s;
  const hc = String(window.__heatingCurve ?? window.heatingcurve ?? '').toLowerCase().trim();
  return (hc === 'directly' || hc === 'direct') ? 0.5 : 0.1;
}

function getHeatLimits(){
  const minA = Number(window.__heatMin);
  const maxA = Number(window.__heatMax);
  if (Number.isFinite(minA) && Number.isFinite(maxA)) return {min: minA, max: maxA};

  const minB = Number(window.minch);
  const maxB = Number(window.maxch);
  if (Number.isFinite(minB) && Number.isFinite(maxB)) return {min: minB, max: maxB};

  const step = getHeatStep();
  return (step === 0.5) ? {min: 25, max: 55} : {min: 12, max: 30};
}

function roundToStep(n, step){
  if (!Number.isFinite(n) || !Number.isFinite(step) || step <= 0) return n;
  const inv = 1 / step;
  return Math.round(n * inv) / inv;
}

function getHeatBase(){
  const cur = parseCommaFloat($('#intempval').val());
  if (Number.isFinite(cur)) return cur;
  const fromSocket = Number(window.setpoint);
  if (Number.isFinite(fromSocket)) return fromSocket;
  return NaN;
}

if (dhwdec) {
  dhwdec.onclick = () => {
    const base = getDhwBase();
    if (!Number.isFinite(base)) return;
    const next = clamp(base - 1, DHW_MIN, DHW_MAX);
    $('#dhwtempval').val(fmtComma1(next));
    const dhwtemp = String(Math.round(next));
    debounce(() => {
      tchange("dhw", dhwtemp, "1")
    }, 1000)();
  };
}

if (dhwinc) {
  dhwinc.onclick = () => {
    const base = getDhwBase();
    if (!Number.isFinite(base)) return;
    const next = clamp(base + 1, DHW_MIN, DHW_MAX);
    $('#dhwtempval').val(fmtComma1(next));
    const dhwtemp = String(Math.round(next));
    debounce(() => {
      tchange("dhw", dhwtemp, "1")
    }, 1000)();
  };
}

/*var dhwtempval = $('#dhwtempval');
var intempval = $('#intempval');
const changeValue = (type,change) => {
    let currentValue
    switch(type){
        case "dhw":
            currentValue = parseInt(dhwtempval.val()) || 0;
	    dhwtempval.val(currentValue + change);
            break;
        case "heat":
            currentValue = parseFloat(intempval.val()) || 0;
	    intempval.val((currentValue + change).toFixed(1));
            break;
    }
};

const startChanging = (type,change) => {
    changeValue(type, change); // Zmień wartość natychmiast
    interval = setInterval(() => changeValue(type, change), 200); // Powtarzaj co 200ms
};

const stopChanging = (type) => {
    clearInterval(interval);
    let temp
    switch(type){
	case "dhw":
	    temp = dhwtempval.val();
	    break;
	case "heat":
	    temp = intempval.val();
	    break;
    }
    debounce(() => {
        tchange(type, temp, "1");
    }, 1000)();
};

// Obsługa przycisku zmniejszania
dhwdec.addEventListener('mousedown', () => startChanging("dhw",-1));
dhwdec.addEventListener('mouseup', stopChanging("dhw"));
dhwdec.addEventListener('mouseleave', stopChanging("dhw"));

// Obsługa przycisku zwiększania
dhwinc.addEventListener('mousedown', () => startChanging("dhw", 1));
//dhwinc.addEventListener('mouseup', () => stopChanging("dhw"));
dhwinc.addEventListener('mouseleave',() => stopChanging("dhw"));

// Obsługa przycisku zmniejszania
    waterdec.addEventListener('mousedown', () => startChanging("heat",-0.1));
//waterdec.addEventListener('mouseup', () => stopChanging("heat"));
waterdec.addEventListener('mouseleave', () => stopChanging("heat"));

// Obsługa przycisku zwiększania
    waterinc.addEventListener('mousedown', () => startChanging("heat", 0.1));
//waterinc.addEventListener('mouseup', () => stopChanging("heat"));
waterinc.addEventListener('mouseleave', () => stopChanging("heat"));
*/

if (waterdec) {
  waterdec.onclick = () => {
    const step = getHeatStep();
    const {min, max} = getHeatLimits();
    const baseRaw = getHeatBase();
    if (!Number.isFinite(baseRaw)) return;
    const base = roundToStep(baseRaw, step);

    if (base <= (min + 1e-9)) {
      appendAlert("Setpoint cannot be lower than: " + fmtComma1(min) + "°C", "danger");
      return;
    }

    const next = clamp(roundToStep(base - step, step), min, max);
    $('#intempval').val(fmtComma1(next));
    const intemp = fmtComma1(next);

    debounce(() => {
      tchange("heat", intemp, "0")
    }, 1000)();
  };
}
if (waterinc) {
  waterinc.onclick = () => {
    const step = getHeatStep();
    const {min, max} = getHeatLimits();
    const baseRaw = getHeatBase();
    if (!Number.isFinite(baseRaw)) return;
    const base = roundToStep(baseRaw, step);

    if (base >= (max - 1e-9)) {
      appendAlert("Setpoint cannot be more than: " + fmtComma1(max) + "°C", "danger");
      return;
    }

    const next = clamp(roundToStep(base + step, step), min, max);
    $('#intempval').val(fmtComma1(next));
    const intemp = fmtComma1(next);

    debounce(() => {
      tchange("heat", intemp, "0")
    }, 1000)();
  };
}
function setwatertemp(which, temp) {
  console.log(which);
  console.log(temp);
    const url = '/settemp'; // Adres URL API
    const data = new FormData(); // Utwórz nowy obiekt FormData
}

/*const alertPlaceholder = document.getElementById('liveAlertPlaceholder');
const appendAlert = (message, type) => {
    const wrapper = document.createElement('div');
    const progressBarColors = {
        success: '#0f5132',
        danger: '#842029',
        warning: '#664d03',
	info: '#055160'
    };
    const progressBarColor = progressBarColors[type] || '#333';
	console.log(message);
    const translatedMessage = i18next.exists(String(message)) ? i18next.t(String(message)) : String(message);

    wrapper.innerHTML = [
        `<div class="alert alert-${type} alert-dismissible fade show" role="alert">`,
        `   <div>${translatedMessage}</div>`,
        '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
        `   <div id="liveAlertProgressBar" class="progress-bar-striped progress-bar-animated" style="height: 5px; background: ${progressBarColor}; width: 100%;"></div>`,
        '</div>'
    ].join('');

    alertPlaceholder.append(wrapper);

    let progressBar = wrapper.querySelector('#liveAlertProgressBar');
    let width = 100;
    let interval = setInterval(() => {
        width -= 5;
        progressBar.style.width = width + '%';
        if (width <= 0) {
            clearInterval(interval);
            wrapper.remove();
        }
    }, 100);
}; */

$(document).ready(function () {
//        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]')
 //       const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl))

    const passwordModalEl = document.getElementById('passwordModal');
    const restartModalEl  = document.getElementById('restartModal');

    const passwordModal = passwordModalEl ? new bootstrap.Modal(passwordModalEl) : null;
    const restartModal  = restartModalEl  ? new bootstrap.Modal(restartModalEl)  : null;

    // Expose modal instances globally for socket.js
    window.passwordModal = passwordModal;
    window.restartModal = restartModal;

    // Otwórz modal po kliknięciu przycisku
    $('#changePasswordBtn').click(function () {
        if (passwordModal) passwordModal.show();
    });

    $('#restartServiceBtn').click(function () {
	if (restartModal) restartModal.show();
    });
    // Funkcja do sprawdzania złożoności hasła
    function validatePasswordStrength(password) {
        const regex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
        return regex.test(password);
    }

    // Sprawdzenie zgodności haseł + złożoności
    function validatePasswords() {
        const password = $('#newPassword').val();
        const confirm = $('#confirmPassword').val();
        const isStrong = validatePasswordStrength(password);

        if (password) {
            if (isStrong) {
                $('#newPassword').addClass("is-valid").removeClass("is-invalid");
            } else {
                $('#newPassword').addClass("is-invalid").removeClass("is-valid");
            }
        } else {
            $('#newPassword').removeClass("is-valid is-invalid");
        }

        if (confirm) {
            if (password === confirm) {
                $('#confirmPassword').addClass("is-valid").removeClass("is-invalid");
            } else {
                $('#confirmPassword').addClass("is-invalid").removeClass("is-valid");
            }
        } else {
            $('#confirmPassword').removeClass("is-valid is-invalid");
        }

        // Aktywacja przycisku tylko gdy hasło jest mocne i zgadza się z powtórzeniem
        if (isStrong && password === confirm) {
            $('#submitBtn').removeAttr("disabled");
        } else {
            $('#submitBtn').attr("disabled", true);
        }
    }

    // Wysłanie POST na backend (z użyciem $.post)
    function submitPasswordChange() {
        const user = "admin" // "admin" (domyślnie)
        const password = $('#newPassword').val();
        if (!user || !validatePasswordStrength(password) || password !== $('#confirmPassword').val()) {
            return;
        }
        $('#submitBtn')
            .html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Zmieniam...')
            .attr("disabled", true);

        $.post('/changepass', { user: "admin", password: password }, function (data) {
		appendAlert(data, "success");
                if (passwordModal) passwordModal.hide();
		debounce(() => {$.get('/logout', function(data) {location.reload();});}, 2500)();

        }).fail(function () {
		appendAlert("Error", "danger");
	}).always(function () {
            // Przywrócenie normalnego przycisku po zakończeniu operacji
            $('#submitBtn')
                .html('Zmień hasło')
                .attr("disabled", false);
        });
    }
    var errorRestart = sleepper(() => {
            if (restartModal) restartModal.hide();
            appendAlert("Przekroczono czas oczekiwania. Prawdopodobnie usługa Haier nie uruchomiła się prawidłowo.", "danger", 0);
            $('#restartBtn')
                .html('Restart')
                .attr("disabled", false);
    }, 40000);

    window.errorRestart = errorRestart;

    function restartService() {
        $('#restartBtn')
            .html('<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Restarting...')
            .attr("disabled", true);
	$.get('/restart');
	    errorRestart()
/*	debounce(() => {
	    if (restartModal) restartModal.hide();
	    appendAlert("Usługa zrestartowana", "success");
	    $('#restartBtn')
                .html('Restart')
                .attr("disabled", false);

	}, 30000)();*/
    }
    // Nasłuchiwanie zmian w polach haseł
    $('#newPassword, #confirmPassword').on("input", validatePasswords);

    // Obsługa przycisku wysyłającego
    $('#submitBtn').click(submitPasswordChange);
    $('#restartBtn').click(restartService)
});