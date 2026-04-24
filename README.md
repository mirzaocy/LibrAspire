# LibrAspire – Aplikasi Perpustakaan Digital

LibrAspire adalah aplikasi web perpustakaan digital yang dibangun dengan React.js dan Next.js (App Router). Aplikasi ini memungkinkan pengguna mencari buku, melihat detail, menyimpan ke rak baca pribadi, dan banyak lagi. Data buku diambil dari Open Library API secara real-time.

## Anggota Kelompok
1. Muhammad Mirza Al Farrosy
2. Naufal Aushoof
3. Lay Genda Surya Putra
4. Raffa Samdya
5. Muhammad Rifqi Darmawan

# Fitur-Fitur
- 🔐 Login & Register User
- 📖 Peminjaman Buku
- 🔎 Pencarian & Filter Buku
- ⭐ Rating & Review Buku
- 🔔 Notifikasi Pengguna

# Cara Menjalankan Proyek
1. Clone Repository
```bash
git clone https://github.com/username/libraspire.git
```
2. Install Dependencies
```bash
pnpm install
```
3. Buat file .env.local di root proyek, isi dengan:
```bash
NEXT_PUBLIC_OPEN_LIBRARY_API_URL=https://openlibrary.org
```
4. Jalankan server development
```bash
pnpm run dev
```
5. Buka browser di http://localhost:3000

# Struktur Folder(Relevan)
```bash
libraspire/
├── src/
│   ├── app/
│   │   ├── books/[id]/page.js    # Halaman detail dinamis
│   │   ├── my-shelf/page.js      # Rak baca
│   │   ├── search/page.js        # Pencarian buku
│   │   ├── layout.js             # Layout utama + Navbar
│   │   └── page.js               # Beranda
│   ├── components/
│   │   ├── BookCard.jsx          # Kartu buku reusable
│   │   ├── Navbar.jsx            # Komponen navigasi
│   │   └── BorrowButton.jsx      # Tombol interaktif
│   └── styles/globals.css
├── public/placeholder.jpg        # Gambar cadangan cover
├── .env.local                    # Environment variables
└── package.json
```

# Screenshot

# Pengujian

# Kredit & Sumber Data
