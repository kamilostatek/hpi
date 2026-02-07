/*!
* Start Bootstrap - Simple Sidebar v6.0.6 (https://startbootstrap.com/template/simple-sidebar)
* Copyright 2013-2023 Start Bootstrap
* Licensed under MIT (https://github.com/StartBootstrap/startbootstrap-simple-sidebar/blob/master/LICENSE)
*/
//
// Scripts
//

/*function translateElement(id) {
    const element = document.getElementById(id);
    if (!element) return;

    // Początkowe tłumaczenie po załadowaniu strony
    element.textContent = i18next.t(element.textContent.trim());

    // Obserwowanie zmian i dynamiczne tłumaczenie
    const observer = new MutationObserver(() => {
        element.textContent = i18next.t(element.textContent.trim());
    });

    observer.observe(element, { childList: true, subtree: true });
}*/

function translateElement(id) {
    const element = document.getElementById(id);
    if (!element) return;

    // Początkowe tłumaczenie po załadowaniu strony
    let lastValue = element.textContent.trim();
    element.textContent = i18next.t(lastValue);

    // Obserwowanie zmian i dynamiczne tłumaczenie
    const observer = new MutationObserver((mutationsList) => {
        for (let mutation of mutationsList) {
            if (mutation.type === "childList") {
                let newValue = element.textContent.trim();
                
                // Zapobieganie zapętleniu - zmieniamy tylko, gdy wartość się zmienia
                if (newValue !== lastValue) {
                    lastValue = newValue;

                    // Wyłączamy obserwator na czas aktualizacji tekstu
                    observer.disconnect();
                    element.textContent = i18next.t(newValue);
                    
                    // Włączamy ponownie po zmianie
                    observer.observe(element, { childList: true, subtree: true });
                }
            }
        }
    });

    observer.observe(element, { childList: true, subtree: true });
}


window.addEventListener('DOMContentLoaded', event => {

    // Toggle the side navigation
    const sidebarToggle = document.body.querySelector('#sidebarToggle');
    if (sidebarToggle) {
        // Uncomment Below to persist sidebar toggle between refreshes
        // if (localStorage.getItem('sb|sidebar-toggle') === 'true') {
        //     document.body.classList.toggle('sb-sidenav-toggled');
        // }
        sidebarToggle.addEventListener('click', event => {
            event.preventDefault();
            document.body.classList.toggle('sb-sidenav-toggled');
            localStorage.setItem('sb|sidebar-toggle', document.body.classList.contains('sb-sidenav-toggled'));
        });
    }

});

/*        $(document).ready(function() {
    // Emoji flags are not available on some desktop setups; use SVG assets for consistency.
    const langFlags = {
        "en": "/static/flags/en.svg",
        "pl": "/static/flags/pl.svg",
        "nl": "/static/flags/nl.svg"
    };

            function getCookie(name) {
                let match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
                return match ? match[2] : null;
            }
            
            let browserLang = navigator.language || navigator.userLanguage;
		if (!["en", "pl", "nl"].includes(browserLang)) {
        browserLang = "en"; // Domyślny język
    }
            let savedLang = getCookie('i18next') || browserLang;
	    $("#current-lang-flag").text(langFlags[savedLang]);
            i18next
                .use(i18nextHttpBackend)
                .init({
                    lng: savedLang,
                    fallbackLng: 'en',
                    debug: false,
                    backend: {
                        loadPath: 'static/locales/{{lng}}/translation.json'
                    }
                }, function(err, t) {
                    jqueryI18next.init(i18next, $);
                    $('body').localize();
		    $('body').fadeIn(500); // Płynne pojawienie się strony
		    //$('body').show();
		    //refreshTooltips();
                });
		*/

$(document).ready(function() {
    // Emoji flags are not available on some desktop setups; use SVG assets for consistency.
    const langFlags = {
        "en": "/static/flags/en.svg",
        "pl": "/static/flags/pl.svg",
        "nl": "/static/flags/nl.svg"
    };

    function getLocalStorageItem(key) {
        return localStorage.getItem(key);
    }

    function setLocalStorageItem(key, value) {
        localStorage.setItem(key, value);
    }

    let browserLang = navigator.language || navigator.userLanguage;
    if (!["en", "pl", "nl"].includes(browserLang)) {
        browserLang = "en"; // Domyślny język
    }

    let savedLang = getLocalStorageItem('i18next') || browserLang;
    $("#current-lang-flag").attr("src", langFlags[savedLang]).attr("alt", savedLang.toUpperCase());

    i18next
        .use(i18nextHttpBackend)
        .init({
            lng: savedLang,
            fallbackLng: 'en',
            debug: false,
            backend: {
                loadPath: 'static/locales/{{lng}}/translation.json'
            }
        }, function(err, t) {
            jqueryI18next.init(i18next, $);
            $('body').localize();
            $('body').fadeIn(500);
        });

    // Obsługa zmiany języka i zapisywanie do localStorage
    $(".lang-selector").on("click", function() {
	    console.log($(this).data("lang"));
        let newLang = $(this).data("lang");
        setLocalStorageItem('i18next', newLang);
     //   location.reload(); // Przeładowanie, aby zastosować nowy język
    });
//});
function refreshTooltips() {
        // Usunięcie istniejących tooltipów
        $('[data-bs-toggle="tooltip"]').each(function() {
            let tooltipInstance = bootstrap.Tooltip.getInstance(this);
            if (tooltipInstance) {
                tooltipInstance.dispose(); // Usuń istniejący tooltip
            }
        });

        // Ponowna inicjalizacja tooltipów
        $('[data-bs-toggle="tooltip"]').tooltip();
    }
            function changeLanguage(lang) {
                i18next.changeLanguage(lang, function() {
                    $('body').localize();
                    document.cookie = "i18next=" + lang + "; path=/";
		    $("#current-lang-flag").attr("src", langFlags[lang]).attr("alt", lang.toUpperCase()); // Zmień flagę w menu
		    refreshTooltips();
                });
            }
            $('#lang-pl').click(function() { changeLanguage('pl'); });
            $('#lang-en').click(function() { changeLanguage('en'); });
	    $('#lang-nl').click(function() { changeLanguage('nl'); });
        });


/*!
 * Color mode toggler for Bootstrap's docs (https://getbootstrap.com/)
 * Copyright 2011-2024 The Bootstrap Authors
 * Licensed under the Creative Commons Attribution 3.0 Unported License.
 */

(() => {
  'use strict'
  const getStoredTheme = () => localStorage.getItem('theme')
  const setStoredTheme = theme => localStorage.setItem('theme', theme)

  const getPreferredTheme = () => {
    const storedTheme = getStoredTheme()
    if (storedTheme) {
      return storedTheme
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  const setTheme = theme => {
    if (theme === 'auto') {
      document.documentElement.setAttribute('data-bs-theme', (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))
    } else {
      document.documentElement.setAttribute('data-bs-theme', theme)
    }
  }

  setTheme(getPreferredTheme())

  const showActiveTheme = (theme, focus = false) => {
    const themeSwitcher = document.querySelector('#bd-theme')

    if (!themeSwitcher) {
      return
    }
    const themeSwitcherText = document.querySelector('#bd-theme-text')
    const activeThemeIcon = document.querySelector('.theme-icon-active use')
    const btnToActive = document.querySelector(`[data-bs-theme-value="${theme}"]`)
    const svgOfActiveBtn = btnToActive.querySelector('svg use').getAttribute('href')

    document.querySelectorAll('[data-bs-theme-value]').forEach(element => {
      element.classList.remove('active')
      element.setAttribute('aria-pressed', 'false')
    })
    btnToActive.classList.add('active')
    btnToActive.setAttribute('aria-pressed', 'true')
    activeThemeIcon.setAttribute('href', svgOfActiveBtn)
    const themeSwitcherLabel = `${themeSwitcherText.textContent} (${btnToActive.dataset.bsThemeValue})`
    themeSwitcher.setAttribute('aria-label', themeSwitcherLabel)
    if (focus) {
      themeSwitcher.focus()
    }
  }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const storedTheme = getStoredTheme()
    if (storedTheme !== 'light' && storedTheme !== 'dark') {
      setTheme(getPreferredTheme())
    }
  })

  window.addEventListener('DOMContentLoaded', () => {
    showActiveTheme(getPreferredTheme())

    document.querySelectorAll('[data-bs-theme-value]')
      .forEach(toggle => {
        toggle.addEventListener('click', () => {
          const theme = toggle.getAttribute('data-bs-theme-value')
          setStoredTheme(theme)
          setTheme(theme)
          showActiveTheme(theme, true)
        })
      })
  })
})()
/*
const alertPlaceholder = document.getElementById('liveAlertPlaceholder');
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
};
*/

const alertPlaceholder = document.getElementById('liveAlertPlaceholder');

const appendAlert = (message, type, timeout = 2000, addi = "") => {
    // Backward compatibility: backend sometimes sends type="error" (Bootstrap uses "danger")
    if (type === "error") type = "danger";
    if (!alertPlaceholder) { console.warn("liveAlertPlaceholder not found"); return; }
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
    if (type == "warning") {
	    timeout = 10000
    }
	else if (type == "danger") {
		timeout = 0
	}
    wrapper.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            <div>${translatedMessage} ${addi}</div>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            ${timeout > 0 ? `<div id="liveAlertProgressBar" class="progress-bar-striped progress-bar-animated" style="height: 5px; background: ${progressBarColor}; width: 100%;"></div>` : ''}
        </div>
    `;

    alertPlaceholder.append(wrapper);

    if (timeout > 0) {
    //    let progressBar = wrapper.querySelector('.progress-bar-striped');
        let progressBar = wrapper.querySelector('#liveAlertProgressBar');
        let width = 100;
        let interval = setInterval(() => {
            width -= 100 / (timeout / 100); // Skaluje animację zgodnie z czasem
            progressBar.style.width = width + '%';
            if (width <= 0) {
                clearInterval(interval);
                wrapper.remove();
            }
        }, 100);
    }
};
