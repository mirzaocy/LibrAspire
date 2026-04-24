# Backend Guide

## Ringkasan

Folder `librAspire` sekarang menjadi folder utama dan satu-satunya source of truth untuk pengembangan LibrAspire.
Autentikasi akun dan session login ditangani oleh server Python yang ada di folder ini.

Fitur yang tersedia di versi backend:

- login dan register lewat backend
- status pinjam buku per user
- halaman detail buku berbasis parameter URL
- discovery buku eksternal secara async
- form kontak dengan draft otomatis

## Cara menjalankan

Buka terminal di folder `ASpire/librAspire`, lalu jalankan:

```powershell
python server.py
```

Kalau berhasil, buka:

```text
http://127.0.0.1:8000/home.html
```

Jangan buka file HTML dengan double click, karena autentikasi backend butuh website dijalankan lewat server.

## Halaman utama

- `home.html`
- `catalog.html`
- `book.html`
- `contact.html`

## Data backend yang dipakai

- `users.json`: data akun
- memory server: session login
- `localStorage`: status pinjam buku, draft contact, dan histori pesan

## Endpoint backend

- `POST /api/register`
- `POST /api/login`
- `GET /api/session`
- `POST /api/logout`

## Kenapa tetap ada localStorage?

Backend dipakai untuk identitas user dan session login.
Sementara itu, interaksi frontend seperti draft form dan status pinjam per user tetap disimpan di browser agar demo lebih ringan dan mudah dipelajari.
