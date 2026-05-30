# 🚀 FlowDesk - Şirket İçi Haberleşme & Görev Takip Sistemi

[![GitHub License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Firebase](https://img.shields.io/badge/database-Firestore--Realtime-orange?logo=firebase)](https://firebase.google.com/)
[![HTML5](https://img.shields.io/badge/frontend-HTML5--VanillaJS-brightgreen)](https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/HTML5)
[![CSS3](https://img.shields.io/badge/styling-Glassmorphism--CSS3-blueviolet)](https://developer.mozilla.org/en-US/docs/Web/CSS)

FlowDesk, şirket içi ekiplerin projelerini, atanan görevlerini ve yazışmalarını tek bir merkezi noktada, **gerçek zamanlı (real-time)** olarak yönetebildiği, premium cam (glassmorphism) tasarımlı ve katı yetkilendirme altyapılı modern bir web uygulamasıdır.

Bu proje, bir yazılım geliştiricisinin portföyünde yer alabilecek **ileri düzey yetkilendirme, veri tabanı şifrelemesi ve anlık senkronizasyon** tekniklerini sergilemek amacıyla endüstri standartlarında inşa edilmiştir.

---

## 🌟 Öne Çıkan Gelişmiş Özellikler

- 💼 **Dinamik Patron (Admin) Kontrolü:** Patron; yeni projeler oluşturabilir, çalışan atayabilir, görev listeleri hazırlayabilir ve şirket havuzuna anlık olarak yeni çalışanlar kaydedebilir.
- 🔒 **Katı Yetkilendirme (Privacy Boundary):** Bir projeye sadece kimler atandıysa, o sohbet kanalını ve görev kutularını yalnızca o kişiler görebilir ve erişebilir. Şirketteki diğer çalışanlar projeden tamamen habersizdir.
- 👁️ **Şifreli Davet Kodu ve Gözlemci (Observer) Modu:**
  - Patron, proje grubunda olmayan harici denetçiler veya yöneticiler için **kriptografik olarak şifrelenmiş Base64 davet kodları** üretebilir.
  - Bu kodla gruba giriş yapan kişiler **Gözlemci** yetkisine sahip olur. Gözlemciler sohbeti ve görevleri canlı izleyebilir, ancak mesaj gönderemez veya görev kutularına tik atamazlar (**Salt-Okunur Güvenlik Sınırı**).
- ⏳ **Bitiş Tarihi (Deadline) & Canlı Geri Sayım:** Her projeye bitiş tarihi atanabilir. Kalan süre (örn: *"2 gün, 4 saat kaldı"* veya *"Süre Doldu!"*) sol listede ve sohbet başlığında anlık olarak hesaplanıp renk kodlu (Kırmızı/Turuncu/Yeşil) olarak gösterilir.
- 🔥 **Bulut Entegrasyonu (Firebase Firestore):** Bulut bağlantısı kurulduğunda, tüm işlemler (mesajlar, görev tikleri, yeni elemanlar) tüm sekmelerde ve cihazlarda sayfa yenilenmeden saliseler içinde eşitlenir.
- ⚡ **Sihirli Sekmeler Eşitlemesi (BroadcastChannel API):** Firebase bağlı değilken dahi, tarayıcıda açtığınız yan yana sekmeler (BroadcastChannel API kullanılarak) sekmeler arası **gerçek zamanlı** veri senkronizasyonu sağlar!

---

## 🛠️ Teknolojik Altyapı

* **Çekirdek:** HTML5 (Semantik Yapı) & Vanilla JavaScript (Es6+)
* **Tasarım:** CSS3 (Premium Glassmorphic Gece Teması, Google Fonts 'Outfit', Canlı neon geçişler, özel animasyonlu checkbox bileşenleri)
* **Veritabanı:** Google Firebase Cloud Firestore (Real-time NoSQL)
* **Haberleşme:** HTML5 BroadcastChannel API (Simülasyon Modu)

---

## 📐 Veritabanı Mimarisi (Firestore Schema)

Firestore üzerinde iki ana koleksiyon gerçek zamanlı olarak dinlenir:

### 1. `flowdesk_employees` (Çalışanlar)
```json
Document ID: "Ahmet Can"
{
  "name": "Ahmet Can",
  "role": "iOS Geliştirici",
  "color": "3",
  "createdAt": 1717070010200
}
```

### 2. `flowdesk_groups` (Projeler & Görevler & Sohbetler)
```json
Document ID: "group_1717075040203"
{
  "name": "iOS Swift Revizyonu",
  "members": ["Patron", "Ahmet Can"],
  "observers": ["Zeynep"],
  "deadline": "2026-06-15",
  "createdAt": 1717075040203,
  "tasks": [
    {
      "id": "task_1",
      "title": "1. Swift UI arayüzünü güncelle",
      "completed": true,
      "completedBy": "Ahmet Can"
    }
  ],
  "messages": [
    {
      "sender": "Sistem",
      "text": "Ahmet Can şifreli davet kodunu kullanarak GÖZLEMCİ 👁️ olarak projeye dahil oldu!",
      "time": "17:28",
      "isSystem": true
    }
  ]
}
```

---

## 🚀 Kurulum ve Başlangıç

Projeyi yerel bilgisayarınızda veya sunucunuzda çalıştırmak için aşağıdaki adımları izleyin:

### 1. Firebase Kurulumu & Buluta Bağlama
1. [Firebase Console](https://console.firebase.google.com/) adresine gidin ve yeni bir proje oluşturun.
2. Sol menüden **Databases & Storage > Firestore** seçeneğine tıklayın.
3. **"Create Database"** butonuna basarak güvenlik kurallarını **"Test Mode"** (Test Modu) olarak başlatın. Konum olarak size en yakın bölgeyi seçip aktifleştirin.
4. Firebase Proje Anasayfasında Web (`</>`) ikonuna tıklayarak uygulamanızı kaydedin.
5. Karşınıza gelen `firebaseConfig` nesnesini kopyalayıp `app.js` dosyasının en üstündeki ilgili alana yapıştırın:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_AUTH_DOMAIN",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_STORAGE_BUCKET",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID"
   };
   ```

### 2. Çalıştırma
* Projeyi çalıştırmak için hiçbir sunucu kurulumu veya `npm install` gereksinimi yoktur.
* Klasör içerisindeki `index.html` dosyasına çift tıklayarak tarayıcınızda anında açabilirsiniz!

---

## 💻 GitHub'a Yükleme Rehberi (Git Push)

Projeyi kendi GitHub profilinize yüklemek için terminalde proje klasörüne gidip sırasıyla şu komutları çalıştırabilirsiniz:

```bash
# 1. Git'i başlatın
git init

# 2. Tüm dosyaları ekleyin
git add .

# 3. İlk commit'inizi yapın
git commit -m "feat: FlowDesk - şirket içi haberleşme, şifreli gözlemci ve deadline sayacı eklendi"

# 4. GitHub'da oluşturduğunuz boş depoyu bağlayın
git remote add origin https://github.com/KULLANICI_ADINIZ/DEPO_ADINIZ.git

# 5. Ana dalı ayarlayın ve gönderin
git branch -M main
git push -u origin main
```

---

## 📄 Lisans
Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır. Serbestçe kopyalayabilir, değiştirebilir ve kendi portföyünüzde sergileyebilirsiniz.
