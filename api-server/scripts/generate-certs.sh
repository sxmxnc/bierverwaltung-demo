#!/bin/bash
# Muster nach: Prof. Dr. Norman Lahme-Hütig (FH Münster) Vorlesung Kapitel 6

# Bricht das Skript sofort ab, wenn ein Befehl fehlschlägt (Exit-Code != 0)
set -e

# Pflichtparameter: Hostname der VM, auf der nginx später läuft
# Wird im Gitlab über Variablen gesetzt
if [ -z "$DEPLOY_HOST" ]; then
  echo "DEPLOY_HOST nicht gesetzt. Beispiel: export DEPLOY_HOST=localhost"
  exit 1
fi

HOST=$DEPLOY_HOST

# Absoluter Pfad zum scripts/-Verzeichnis, unabhängig davon, von wo das Skript aufgerufen wird
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
# Zielverzeichnis für alle erzeugten Schlüssel und Zertifikate; überschreibbar per Env-Variable
CERTS_DIR="${CERTS_DIR:-/opt/certs}"
mkdir -p "$CERTS_DIR"
cd "$CERTS_DIR"

#  Root CA
# Privater Schlüssel der Root CA, AES-256-verschlüsselt (Passphrase wird interaktiv abgefragt)
openssl genrsa -aes256 -out root-ca.key.pem 4096
# Selbst-signiertes Root-Zertifikat, gültig 20 Jahre (7300 Tage)
openssl req -x509 -new -days 7300 -sha512 -utf8 -extensions v3_ca \
  -config "$SCRIPTS_DIR/root-ca.config" \
  -key root-ca.key.pem -out root-ca.cert.pem

# Intermediate CA
# Eigener Schlüssel für die Intermediate CA (ebenfalls passwortgeschützt)
openssl genrsa -aes256 -out intermediate-ca.key.pem 4096
# Certificate Signing Request (CSR): Antrag, den die Root CA unterschreiben soll
openssl req -new -sha512 -utf8 \
  -config "$SCRIPTS_DIR/intermediate-ca.config" \
  -key intermediate-ca.key.pem -out intermediate-ca.csr.pem
# Root CA signiert den CSR → Intermediate-Zertifikat, gültig 10 Jahre
openssl x509 -req -days 3650 -sha512 -CAcreateserial \
  -CA root-ca.cert.pem -CAkey root-ca.key.pem \
  -extensions v3_intermediate_ca -extfile "$SCRIPTS_DIR/intermediate-ca.config" \
  -in intermediate-ca.csr.pem -out intermediate-ca.cert.pem

# Server-Zertifikat
# Hostname in die Config einsetzen (wird als CN und SAN benötigt)
sed "s/{hostname}/$HOST/" "$SCRIPTS_DIR/server.config.template" > "$SCRIPTS_DIR/server.config"
# Server-Schlüssel ohne Passphrase, damit nginx ihn beim Start automatisch laden kann
openssl genrsa -out server.key.pem 4096
openssl req -new -sha512 -utf8 \
  -config "$SCRIPTS_DIR/server.config" \
  -key server.key.pem -out server.csr.pem
  
# Intermediate CA signiert das Server-Zertifikat, gültig 1 Jahr
openssl x509 -req -days 365 -sha512 -CAcreateserial \
  -CA intermediate-ca.cert.pem -CAkey intermediate-ca.key.pem \
  -extensions v3_req -extfile "$SCRIPTS_DIR/server.config" \
  -in server.csr.pem -out server.cert.pem

# Zertifikatskette für nginx: Server + Intermediate in einer Datei,
# damit der Browser die Kette bis zur Root CA aufbauen kann
cat server.cert.pem intermediate-ca.cert.pem > chain.cert.pem

echo "Zertifikate liegen in $CERTS_DIR"
echo "root-ca.cert.pem muss noch im Browser/System installiert werden"
