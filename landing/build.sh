#!/bin/sh
# Recompila o CSS da landing a partir das classes usadas em index.html.
#
# Precisa rodar DEPOIS de qualquer mudança no HTML: o Tailwind só inclui a
# classe que ele viu no arquivo. Esquecer isto foi o que fez o herói continuar
# centralizado depois de eu já ter escrito `lg:text-left` no HTML — a classe
# existia na marcação e não existia na folha.
cd "$(dirname "$0")"
../web/node_modules/.bin/tailwindcss -c tailwind.config.js -i tailwind.src.css -o vendor/tailwind.css --minify
