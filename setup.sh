#!/bin/sh
echo "----------Welcome to FLO-Whatsapp installation----------"
echo "----------Installing TOR----------"
apt-get install tor
echo "----------Configuring Tor for FLO-Whatsapp----------"
echo $PWD
cat <<EOT >> /etc/tor/torrc
HiddenServiceDir $PWD/.hidden_service/
HiddenServicePort 8000 127.0.0.1:8000
EOT
chmod 700 $PWD
echo "----------Finished Configuring----------"

