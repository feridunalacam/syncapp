#!/bin/bash

# 🚀 Hızlı GitHub Push Scripti
# Kullanım: ./gitpush.sh "Commit mesajı"

MESSAGE="$1"

if [ -z "$MESSAGE" ]; then
    echo "❌ Commit mesajı gerekli!"
    echo "Kullanım: ./gitpush.sh \"Mesaj buraya\""
    exit 1
fi

echo "🔄 Değişiklikler hazırlanıyor..."
git add .

echo "💾 Commit ediliyor: $MESSAGE"
git commit -m "$MESSAGE"

echo "🚀 GitHub'a gönderiliyor..."
git push

echo "✅ Tamamlandı! GitHub'da görebilirsin:"
echo "   https://github.com/feridunalacam/syncapp"

