# Osmanlı Strateji: Kart Tabanlı 3D Gerçek Zamanlı Strateji Oyunu

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-3D-green.svg)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-Bundler-purple.svg)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---
<div align="center">

<a href="https://strategic-card-wars2.netlify.app/" style="display:inline-block; background:rgba(15, 23, 42, 0.92); color:#fbbf24; padding:18px 45px; border:2px solid #fbbf24; border-radius:12px; font-size:22px; font-weight:bold; text-decoration:none;">
  🎮 OYUNU OYNA
</a>

</div>

## 📜 İçindekiler
1. [Oyun Tanıtımı](#-oyun-tanıtımı)
2. [Öne Çıkan Özellikler](#-öne-çıkan-özellikler)
3. [Kullanıcılar İçin: Oynanış Kılavuzu](#-kullanıcılar-için-oynanış-kılavuzu)
   - [Oyun Evreleri](#oyun-evreleri)
   - [Ekonomi ve İşçiler](#ekonomi-ve-işçiler)
   - [Asker Sınıfları ve Savaş Mekanikleri](#asker-sınıfları-ve-savaş-mekanikleri)
   - [Kontroller ve Arayüz](#kontroller-ve-arayüz)
4. [Geliştiriciler İçin: Teknik Mimari ve Kurulum](#-geliştiriciler-için-teknik-mimari-ve-kurulum)
   - [Teknoloji Yığını](#teknoloji-yığını)
   - [Proje Dosya Yapısı](#proje-dosya-yapısı)
   - [Kurulum ve Çalıştırma](#kurulum-ve-çalıştırma)
   - [Geliştirici Test Modu (?test=1)](#geliştirici-test-modu-test1)
5. [Ses ve Müzik Sistemi (`public/audio`)](#-ses-ve-müzik-sistemi-publicaudio)
6. [Lisans](#-lisans)

---

## 🏰 Oyun Tanıtımı

**Osmanlı Strateji**, tarayıcı üzerinden 3D olarak çalışan, klasik RTS (Gerçek Zamanlı Strateji) dinamiklerini **kart tabanlı deste oluşturma**, **otomatik birlik komuta sistemleri** ve **detaylı ekonomik yönetim** ile harmanlayan yenilikçi bir tek oyunculu strateji oyunudur. Oyuncu, Osmanlı İmparatorluğu'nun tarihi zenginliğinden ilham alan birlikler ve binalarla düşman yapay zekasına karşı stratejik üstünlük kurmaya çalışır.

---

## ✨ Öne Çıkan Özellikler

- **3D Low-Poly Görsel Atmosfer**: Three.js ile oluşturulmuş Osmanlı mimarisi binalar (Ana Karargâh, Hisar, Tophane, Tersane, Ocaklar), birimler (Yeniçeri, Deliler, Tirendaz, Şahi Topu, Zırhlı Fil, Fetih Gemisi) ve dinamik zemin/atmosfer efektleri.
- **Kart Deste Sistemi**: Sefer öncesi hazırlık ekranında kart koleksiyonundan desteler oluşturma ve maç içerisinde taktiksel üstünlük sağlama.
- **Gelişmiş Yapay Zeka ve Savaş AI**: Otomatik formasyon yönetimi (`BattleAI`), akıllı hedef seçimi (`TargetSelector`), engelden kaçınma ve hafif ayrılma (soft separation) algoritmaları.
- **Çok Katmanlı Ekonomi**: Altın ve odun kaynakları, otomatik çalışan madenci ve oduncular, kaynak depolama ve pazar/ticaret mekanikleri.
- **Zorluk Modları ve Komutan Yetenekleri**: Farklı zorluk seviyeleri (Kolay, Normal, Zor, Cehennem) ve oyun tarzını değiştiren komutan yetenekleri.

---

## 🎮 Kullanıcılar İçin: Oynanış Kılavuzu

### Oyun Evreleri
Maçlar gerçek zamanlı bir saat döngüsünde üç ana evrede ilerler:
1. **Hazırlık Evresi (`prep` - 0:00 / 04:00)**: Binalar inşa edilir, ekonomik işçiler üretilir, askerler ocaklarda eğitilir ve toplanma (rally) noktalarında formasyon alınır. Düşman bu aşamada görünmezdir.
2. **Yürüyüş Evresi (`march` - 04:00 / 05:00)**: Ordular orta alana doğru hareketlenir, savaş boruları çalmaya başlar.
3. **Savaş Evresi (`war` - 05:00 ve sonrası)**: Savaş tam anlamıyla başlar. Askerler doğrudan düşman hatlarına ve ana karargâhına saldırır.

### Ekonomi ve İşçiler
- **Altın Madencisi ve Oduncu**: Ana Karargâh üzerinden üretilirler. Oyuncunun ekstra komutuna gerek kalmadan en yakın kaynak düğümüne (altın ocağı veya orman) gider, kaynak toplar ve Ana Karargâh'a geri taşıyarak ekonomiyi beslerler.
- **Bina İnşası**: Hisar, Tophane, Okçular Ocağı, Yeniçeri Ocağı, Süvari Ocağı, Fil Ocağı ve Tersane gibi yapılar haritaya yerleştirilerek yeni askeri birimlerin kilidi açılır.

### Asker Sınıfları ve Savaş Mekanikleri
- **Tirendaz (Okçular)**: Uzaktan saldırır, menzili yüksektir.
- **Yeniçeri (Piyade)**: Dengeli yakın dövüş birimi.
- **Deliler (Süvari)**: Çok hızlıdır; düşman işçilerine ve okçulara karşı etkilidir.
- **Şahi & Fetih Gemisi**: Binalara karşı devasa yıkıcı güce sahip kuşatma birimleri.
- **Zırhlı Fil**: Yüksek cana sahip ağır vurucu süvari.

### Kontroller ve Arayüz
- **Kamera**: Fare tekerleği ile yakınlaşma/uzaklaşma, sağ tık basılı tutarak döndürme ve WASD tuşları ile haritada gezinme.
- **Bina ve Kart Yerleştirme**: Alt panelden kartlara tıklayarak haritada uygun zeminlere binalar yerleştirilir.
- **Üst Panel (HUD)**: Anlık altın, odun, nüfus limiti, oyun hızı kontrolü (1x, 2x, 4x) ve duraklatma seçenekleri bulunur.

---

## 💻 Geliştiriciler İçin: Teknik Mimari ve Kurulum

### Teknoloji Yığını
- **Dil**: TypeScript (Katı tip denetimi ve nesne yönelimli mimari)
- **3D Grafik Motoru**: Three.js (InstancedMesh tabanlı yüksek performanslı çizim ve animasyon optimizasyonu)
- **Derleyici & Paket Yöneticisi**: Vite, npm
- **Stil**: Tailwind CSS

### Proje Dosya Yapısı
```text
/
├── public/audio/           # Ses efektleri ve müzik dosyaları
├── src/
│   ├── ai/                 # Ekonomi, Askeri ve Strateji Yapay Zeka modülleri
│   ├── audio/              # Ses yönetim sistemi (AudioManager, audioMap)
│   ├── buildings/          # Bina sınıfları, İnşaat ve Üretim yöneticileri
│   ├── cards/              # Kart koleksiyon ve Deste yöneticileri
│   ├── combat/             # Savaş yöneticisi, Hedef seçici, Hasar hesaplayıcı
│   ├── commanders/         # Komutan yetenekleri ve yöneticisi
│   ├── core/               # Oyun döngüsü (GameLoop), Kamera, Zaman ve Sahne yöneticileri
│   ├── data/               # Oyun verileri (Binalar, Birimler, Kartlar, Haritalar, Kurallar)
│   ├── economy/            # Kaynak, İşçi ve Ekonomi yöneticileri
│   ├── game-modes/         # Zorluk seviyeleri, Hayatta kalma modu ve Zafer koşulları
│   ├── progression/        # Hesap kaydı, Mağaza ve İlerleme yöneticileri
│   ├── render/             # 3D modeller (Bina, Birim, Doğa), Renk Paleti ve Efektler
│   ├── styles/             # Global CSS (Tailwind)
│   ├── ui/                 # Arayüz panelleri (HUD, Menü, Kart Paneli, Minimap)
│   ├── units/              # Birim (Unit) sınıfları, İstatistikler ve Birim yöneticisi
│   ├── world/              # Harita üretimi, Yol bulma (A*), Savaş Sisi ve Arazi
│   ├── main.ts             # Uygulama giriş noktası
│   └── types.ts            # Ortak TypeScript tip tanımları
├── index.html              # HTML giriş noktası
├── package.json            # Bağımlılıklar ve npm scriptleri
└── vite.config.ts          # Vite yapılandırması
```

### Kurulum ve Çalıştırma

Projeyi yerel ortamınızda çalıştırmak için aşağıdaki adımları izleyin:

1. **Depoyu Klonlayın veya Dosyaları İndirin**:
   ```bash
   git clone <repo-url>
   cd <repo-klasörü>
   ```

2. **Bağımlılıkları Yükleyin**:
   ```bash
   npm install
   ```

3. **Geliştirme Sunucusunu Başlatın**:
   ```bash
   npm run dev
   ```
   Tarayıcınızda `http://localhost:3000` adresine giderek oyunu oynayabilirsiniz.

4. **Üretim (Production) Derlemesi**:
   ```bash
   npm run build
   ```

### Geliştirici Test Modu (`?test=1`)
Tarayıcı adres çubuğuna `?test=1` parametresi eklendiğinde (örn: `http://localhost:3000/?test=1`), normal oyuncu kaydına dokunulmaksızın **tüm kartların ve komutanların kilidinin açık olduğu**, 99.999 hesap altınına sahip özel bir test veritabanı aktifleşir. Bu özelliği tamamen kapatmak için `src/data/matchRules.ts` dosyasındaki `allowTestMode` değerini `false` yapabilirsiniz.

---

## 🎵 Ses ve Müzik Sistemi (`public/audio`)

Oyun dinamik ses ve müzik yöneticisine (`AudioManager`) sahiptir. Ses dosyaları `public/audio/` klasörüne yerleştirilmelidir. Eksik ses dosyaları durumunda oyun sessiz modda hatasız çalışmaya devam eder.

*Öneri Format*: MP3 (44,1 kHz, 128 kbps), optimize edilmiş dosya boyutları.

---

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır. Dilediğiniz gibi geliştirebilir, katkıda bulunabilir ve kendi projelerinizde kullanabilirsiniz.
