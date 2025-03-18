#!/bin/bash
#

echo -n "SPRAWDZAM DOSTĘPNĄ ILOŚĆ MIEJSCA: "
miejsce=$(df -h |grep /opt | grep -Eo [0-9]+% |tr -d '%')

if [ $miejsce -gt 98 ]; then
	echo -e "\033[31mERROR\033[0m\nZbyt mała ilość miejsca na \033[35m/opt\033[0m"
	exit 1
else
	echo -e "\033[32mOK\033[0m"
fi
cd /opt/
if [ -d "kamil" ]; then
  echo -e "Czyszczę poprzednią instalacje"
  rm -Rf kami*
fi
echo -e "Pobieram nową wersję"
wget -q https://github.com/kamilostatek/hpi/commit/67d0d8cdd5d00601e452555c6c474d381f864fea#diff-a88bebcc0e607c0d78a5bc63036cf256bc01029b3c9cd56c5b5beeeacf8888d8
echo -e "Rozpakowuje"
tar -xzf kamilV6.tar.gz
echo -e "Wyłączam usługę \033[34mHaierPi\033[0m"
systemctl stop haier
echo -n "Sprawdzam czy usługa została zatrzymana: "

for A in $(seq 5); do

        echo -ne "\b$((6 - $A))"
        sleep 1
done

isdead=$(systemctl status haier |grep 'Active:' |grep -o inactive)
if [ -z $isdead ]; then
	echo -e "\033[31m\bFAIL\033[0m"
	echo -e "Usługa nie zatrzymała się poprawnie, sprawdź przyczynę i powtórz instalację"
	exit 1
else
	echo -e "\033[32m\b OK\033[0m"
fi

echo -e "Nakładam zmiany"
#rm haier/templates/charts.html
#rm haier/templates/index.html
#rm haier/templates/parameters.html
#rm haier/templates/settings.html
rm haier/main.py
mv kamil/main.py haier/main.py
#mv kamil/charts.html haier/templates/charts.html
#mv kamil/index.html haier/templates/index.html
#mv kamil/parameters.html haier/templates/parameters.html
#mv kamil/settings.html haier/templates/settings.html
#echo -e "Aktualizuje bibliotekę \033[32mPyHaier\033[0m"
#source /opt/haier/env/bin/activate
#pip install --upgrade --no-cache-dir PyHaier
#echo -n "Sprawdzam poprawność instalacji: "

#VERS=$(pip freeze |grep PyHaier |cut -d"=" -f3)

#if [ $VERS == "0.3.5" ]; then

#        echo -e "\033[32mOK\033[0m"
#	deactivate
#else
#        echo -e "\033[31mFAILED\033[0m"
#        echo "Wstrzymuje aktualizacje"
#	deactivate
#        exit 1
#fi

#echo -n "sprawdzam poprawność config.ini: "
#cd haier
#HPI=$(cat config.ini |grep HPIAPP)
#hys=$(cat config.ini |grep lohysteresis |cut -d " " -f1)
#hcmant=$(cat config.ini |grep 'hcman =' |cut -d"=" -f2 |wc -c)
#NRLIN=$(sed -n '/^omlon/=' "/opt/haier/config.ini")

#        if [ -z $HPI ]; then
#                echo -ne "\033[31m.\033[0m"
#		sed -i "${NRLIN}a\
#                hpiapp = 0" "/opt/haier/config.ini"
#		sed -i "${NRLIN}a\
#                token = token" "/opt/haier/config.ini"
#                sed -i "${NRLIN}a\
#                [HPIAPP]" "/opt/haier/config.ini"
#        else
#                echo -ne "\033[32m.\033[0m"
#        fi

#if [ -z $hys ]; then
#	echo -ne "\033[31m.\033[0m"
#	sed -i "${NRLIN}a\
#	kwhnowcorr = 1" "/opt/haier/config.ini"
#	sed -i "${NRLIN}a\
#	lohysteresis = 0.2" "/opt/haier/config.ini"
#	sed -i "${NRLIN}a\
#	hihysteresis = 0.2" "/opt/haier/config.ini"
#	sed -i "${NRLIN}a\
#        antionoffdeltatime = 5.5" "/opt/haier/config.ini"
#	sed -i "${NRLIN}a\
#        deltatempflimit = 1.5" "/opt/haier/config.ini"
#	sed -i "${NRLIN}a\
#        deltatempquiet = 3.0" "/opt/haier/config.ini"
#	sed -i "${NRLIN}a\
#        deltatempquiet = 6.0" "/opt/haier/config.ini"
#
#else
#	echo -ne "\033[32m.\033[0m"
#fi

#if [ $hcmant -lt 28 ]; then
#	echo -ne "\033[31m.\033[0m"
#	sed -i '/^hcman/c\hcman = 25,25,25,25,25,25,25,25,25,25,25,25,25,25' /opt/haier/config.ini
#else
#	echo -ne "\033[32m.\033[0m"
#fi
#echo -e "\b\b\b\033[32mOK\033[0m"

echo -e "Uruchamiam usługę \033[34mHaierPi\033[0m ponownie"
systemctl start haier

rm -Rf kami*
