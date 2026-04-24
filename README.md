# LibrAspire – Aplikasi Perpustakaan Digital

LibrAspire adalah aplikasi web perpustakaan digital yang dibangun dengan React.js dan Next.js (App Router). Aplikasi ini memungkinkan pengguna mencari buku, melihat detail, menyimpan ke rak baca pribadi, dan banyak lagi. Data buku diambil dari Open Library API secara real-time.


## Anggota Kelompok
1. Muhammad Mirza Al Farrosy
2. Naufal Aushoof
3. Lay Genda Surya Putra
4. Raffa Samdya Adabi Alana Irfandy
5. Muhammad Rifqi Darmawan


# Fitur-Fitur
- 🔐 Login & Register User
- 📖 Peminjaman Buku
- 🔎 Pencarian & Filter Buku
- ⭐ Rating & Review Buku
- 🔔 Notifikasi Pengguna


## Persyaratan

Sebelum menjalankan project ini, pastikan di PC sudah terpasang:

- `Git`
- `Node.js`

Project ini sudah diuji dengan `Node.js v22.22.2`.


## Cara Menjalankan

### 1. Clone repository

```bash
git clone <URL-REPOSITORY-KAMU>
```

### 2. Masuk ke folder project

```bash
cd librAspire
```

### 3. Jalankan server

Karena project ini memakai server Node.js tanpa dependency tambahan, cukup jalankan:

```bash
npm start
```

Atau bisa juga langsung:

```bash
node server.js
```

### 4. Buka di browser

Setelah server aktif, buka:

```text
http://127.0.0.1:8000/home.html
```


## Cara Menggunakan Web

### 1. Buat akun atau login

- klik tombol `Masuk`
- jika belum punya akun, isi nama, email, dan password lalu pilih `Buat Akun`

### 2. Jelajahi katalog

- buka menu `Katalog`
- cari buku berdasarkan judul, penulis, atau kategori
- buka halaman detail untuk melihat informasi lengkap buku

### 3. Pinjam buku atau masuk antrean

- buku yang tersedia bisa langsung dipinjam
- buku yang tidak tersedia bisa dimasuki antrean
- fitur ini hanya bisa dipakai oleh pengguna yang sudah login

### 4. Lihat halaman Buku Saya

Di menu `Buku Saya`, pengguna bisa melihat:

- buku yang sedang dipinjam
- buku yang sedang diantrikan
- buku yang sudah diulas
- reminder/notifikasi pinjaman

### 5. Beri rating dan review

- buka detail buku
- login terlebih dahulu
- isi rating dan ulasan pada bagian review


## File Penting

- [home.html](./home.html) : halaman utama
- [catalog.html](./catalog.html) : katalog buku
- [book.html](./book.html) : detail buku
- [my-books.html](./my-books.html) : rak pribadi pengguna
- [contact.html](./contact.html) : halaman kontak
- [style.css](./style.css) : styling website
- [script.js](./script.js) : logika frontend
- [server.js](./server.js) : server Node.js
- [users.json](./users.json) : data akun pengguna
- [library-data.json](./library-data.json) : data pinjaman, antrean, dan review


## Catatan

- Jalankan web melalui `server.js`, jangan langsung buka file HTML dengan double-click.
- Jika port `8000` sedang dipakai aplikasi lain, ubah variabel `PORT` saat menjalankan server.

Contoh:

```bash
$env:PORT=9000
node server.js
```

Lalu buka:

```text
http://127.0.0.1:9000/home.html
```


# Screenshot


