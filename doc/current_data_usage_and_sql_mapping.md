# Panduan Pemetaan Data Aktif & Penyesuaian Skema SQL Baru

Dokumen ini menjelaskan struktur data yang saat ini (*current*) digunakan di sisi frontend (Vite + React) berbasis arsitektur **Firestore/NoSQL**, serta memberikan analisis komparatif dan panduan adaptasi untuk menyederhanakan data tersebut agar selaras dengan skema database **PostgreSQL (Supabase)** yang baru.

Tujuan utama penyelarasan ini adalah memindahkan kompleksitas pemrosesan data (seperti perhitungan akumulasi, status otomatis, dan pemetaan FIFO) dari memori browser di frontend ke **Backend Server (Express)** dan **Database Trigger (PostgreSQL)**.

---

## Ringkasan Perubahan Paradigma Data (NoSQL vs SQL)

1. **Eliminasi Nested Documents**: Struktur objek bersarang (*nested JSON*) seperti `budgetAllocations` dan `goalAllocations` pada transaksi kini dinormalisasi menjadi tabel relasional mandiri (`transaction_budget_allocations`) atau dihubungkan langsung melalui kunci asing (`goal_id`).
2. **Kalkulasi Otomatis via Database Trigger**: Frontend tidak perlu lagi memicu perubahan saldo dompet atau status target secara manual saat transaksi dibuat/diubah/dihapus. Database trigger (seperti `trg_wallet_balance_adjustment` dan `trg_goal_current_amount_adjustment`) akan menangani sinkronisasi tersebut secara instan.
3. **Penyederhanaan Logika Hutang & Piutang**: Struktur berlapis Firestore yang memisahkan `debtContracts`, `debtPayments`, dan `debtPaymentAllocations` (untuk pencatatan FIFO) kini disederhanakan menjadi satu tabel mutasi terpadu: `debt_loan_mutations`.

---

## Analisis Komparatif Per Modul

### 1. User & Preferensi (`users`)

* **Kondisi Sekarang (Firestore):**
  Struktur user memiliki nested objek yang kompleks untuk preferensi, statistik performa bulanan (`stats`), serta kemajuan konfigurasi (`setupProgress`).
* **Penyederhanaan SQL:**
  * Statistik akumulasi bulanan (`stats`) dihapus dari tabel `users` karena agregasi data akan dihitung secara dinamis oleh backend/database atau diambil dari tabel cache `summaries`.
  * Preferensi dan progress setup disimpan menggunakan kolom bertipe `JSONB` untuk fleksibilitas pembacaan di frontend.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape": {
    "uid": "string",
    "email": "string",
    "displayName": "string",
    "photoURL": "string",
    "preferences": {
      "darkMode": "boolean",
      "currency": "IDR",
      "timezone": "Asia/Jakarta",
      "notifications": { "budgetWarnings": true, "debtReminders": true, "goalMilestones": true }
    },
    "stats": { "totalTransactions": 100, "currentMonthIncome": 5000000 },
    "setupProgress": { "walletCreated": true, "categoriesReviewed": true }
  },
  "new_postgresql_table": "users",
  "simplification_action": "Hapus properti `stats` dari skema user. Simpan preferences dan setup_progress sebagai JSONB. Hilangkan inisialisasi stats di frontend."
}
```

---

### 2. Dompet & Saldo (`wallets`)

* **Kondisi Sekarang (Firestore):**
  Frontend melakukan pembaruan saldo dompet secara manual menggunakan fungsi `updateWalletBalance` setiap kali ada transaksi baru atau transfer.
* **Penyederhanaan SQL:**
  * Kolom `balance` tetap ada di tabel `wallets`.
  * **Otomatisasi:** Update saldo dipicu sepenuhnya oleh database trigger `trg_wallet_balance_adjustment` di PostgreSQL setelah operasi `INSERT/UPDATE/DELETE` pada tabel `transactions`. Frontend cukup melakukan *fetch* ulang data dompet setelah transaksi berhasil.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape": {
    "id": "string (UUID)",
    "name": "string",
    "type": "cash | debit | credit | ewallet | investment",
    "balance": "number (mutated manually by client)",
    "isActive": "boolean",
    "displayOrder": "number"
  },
  "new_postgresql_table": "wallets",
  "simplification_action": "Hapus fungsi manual `updateWalletBalance` dari `transactions.service.ts` di frontend. Serahkan mutasi saldo sepenuhnya ke trigger PostgreSQL."
}
```

---

### 3. Kategori & Subkategori (`categories` & `subcategories`)

* **Kondisi Sekarang (Firestore):**
  Struktur kategori standar disimpan dalam subkoleksi per-user. Kategori memiliki flag `applyToBudget` untuk mengarahkan alokasi otomatis.
* **Penyederhanaan SQL:**
  * Relasi `categories` ke `subcategories` menggunakan aturan kunci asing standar (`category_id REFERENCES categories(id) ON DELETE CASCADE`).
  * `displayOrder` disederhanakan dan dipetakan ke tipe integer.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape_category": {
    "id": "string",
    "name": "string",
    "type": "income | expense",
    "icon": "string",
    "color": "string",
    "applyToBudget": "boolean",
    "displayOrder": "number"
  },
  "new_postgresql_tables": ["categories", "subcategories"],
  "simplification_action": "Sesuaikan query frontend untuk menggunakan join relasional guna mengambil kategori beserta subkategori dalam satu kali request API (e.g. `/api/categories?include=subcategories`)."
}
```

---

### 4. Transaksi Utama (`transactions`)

* **Kondisi Sekarang (Firestore):**
  Pencatatan transaksi sangat rumit karena menyimpan peta alokasi amplop (`budgetAllocations`) dan tabungan (`goalAllocations`) secara bersarang (*nested object*), serta flag denormalisasi lainnya.
* **Penyederhanaan SQL:**
  * **Anggaran (Envelope):** Peta anggaran `budgetAllocations` dipindahkan ke tabel persimpangan `transaction_budget_allocations`.
  * **Target Tabungan:** Alokasi tabungan tidak perlu disimpan dalam peta bersarang; transaksi pengeluaran/pemasukan cukup dihubungkan langsung menggunakan kolom kunci asing `goal_id`.
  * **Hutang & Piutang:** Cukup hubungkan transaksi dengan `debt_id`.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape": {
    "id": "string (UUID)",
    "amount": "number",
    "type": "income | expense",
    "categoryId": "string",
    "categoryName": "string",
    "date": "Date",
    "budgetAllocations": "Record<categoryId, number> (nested)",
    "goalAllocations": "Record<goalId, number> (nested)",
    "debtId": "string (optional)",
    "isDebtPayment": "boolean"
  },
  "new_postgresql_tables": ["transactions", "transaction_budget_allocations"],
  "simplification_action": "1. Normalisasi `budgetAllocations` ke tabel `transaction_budget_allocations`. 2. Ganti nested `goalAllocations` menjadi kolom flat `goal_id` di tabel `transactions`. 3. Biarkan trigger DB mengurus status dan progres goal terkait."
}
```

---

### 5. Anggaran Amplop Bulanan (`budgets`)

* **Kondisi Sekarang (Firestore):**
  Frontend memicu perubahan nilai spent bulanan per kategori dan memperbarui status anggaran (`on-track`, `warning`, `exceeded`) melalui transaksi klien.
* **Penyederhanaan SQL:**
  * **Otomatisasi:** Nilai anggaran terpakai (`spent_amount`) dan pembaharuan kolom `status` anggaran dihitung secara otomatis oleh trigger `trg_budget_spent_adjustment` pada PostgreSQL setiap kali ada baris transaksi baru di bawah kategori terkait.
  * Peta persentase aturan bulanan disimpan di tabel `budget_rules`.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape": {
    "id": "string (YYYY-MM-categoryId)",
    "yearMonth": "string",
    "categoryId": "string",
    "allocatedAmount": "number",
    "spentAmount": "number",
    "status": "on-track | warning | exceeded"
  },
  "new_postgresql_tables": ["budgets", "budget_rules"],
  "simplification_action": "Frontend tidak perlu lagi menghitung dan menulis ulang status budget secara lokal. Cukup lakukan GET ke endpoint `/api/budgets` untuk membaca data yang sudah di-update otomatis oleh trigger database."
}
```

---

### 6. Target Tabungan (`goals`)

* **Kondisi Sekarang (Firestore):**
  Kemajuan tabungan dilacak di subkoleksi `goals/{goalId}/allocations`. Frontend mengkalkulasi ulang `currentAmount` dan memperbarui milestones (25%, 50%, 75%, 100%) secara manual.
* **Penyederhanaan SQL:**
  * **Otomatisasi:** Trigger `trg_goal_current_amount_adjustment` mendeteksi pembuatan transaksi yang mengarah ke `goal_id`. Trigger secara otomatis menambah/mengurangi `current_amount` pada tabel `goals` dan mengubah statusnya menjadi `completed` jika target nominal terlampaui.
  * Agregasi histori alokasi cukup berupa query transaksi biasa dengan filter `goal_id`.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape": {
    "id": "string",
    "name": "string",
    "targetAmount": "number",
    "currentAmount": "number (calculated by client)",
    "status": "active | completed | paused",
    "milestones": { "25": false, "50": false }
  },
  "new_postgresql_table": "goals",
  "simplification_action": "Hapus subkoleksi `allocations`. Setiap kali user menabung untuk goal, backend cukup mencatat transaksi baru dengan field `goal_id` terisi. Biarkan database mengurus akumulasi saldo target."
}
```

---

### 7. Hutang & Piutang (`debts`)

* **Kondisi Sekarang (Firestore):**
  Struktur data sangat kompleks dengan memisahkan `debtContracts` (akad pokok/topup), `debtPayments` (riwayat bayar), dan `debtPaymentAllocations` (pencatatan FIFO di sisi klien).
* **Penyederhanaan SQL:**
  * Seluruh mutasi saldo hutang (baik penambahan pokok baru, pembebanan bunga, maupun pembayaran cicilan) disatukan ke dalam satu tabel histori terpadu: **`debt_loan_mutations`**.
  * Kolom `type` pada mutasi membedakan sifat aksi:
    * `increase`: Menambah utang pokok (akad awal / top-up).
    * `interest`: Pembebanan bunga berjalan.
    * `decrease`: Pembayaran cicilan pelunasan.
  * **Otomatisasi:** Trigger database `trg_debt_loan_status_adjustment` otomatis memantau tabel mutasi ini. Status master hutang di tabel `debt_loans` akan berubah menjadi `completed` apabila sisa saldo pokok dan bunga bernilai kurang dari atau sama dengan nol.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape_master": {
    "id": "string",
    "partyName": "string",
    "principalAmount": "number",
    "interestAmount": "number",
    "paidAmount": "number",
    "status": "active | completed | overdue"
  },
  "new_postgresql_tables": ["debt_loans", "debt_loan_mutations"],
  "simplification_action": "Pindahkan logika algoritma FIFO pembayaran dari client-side ke REST API backend. Frontend hanya mengirimkan request nominal bayar ke server, dan server yang menulis baris mutasi `decrease` di database."
}
```

---

### 8. Transaksi Berulang (`recurring_transactions`)

* **Kondisi Sekarang (Firestore):**
  Sistem mengecek dan mengeksekusi tagihan berulang secara manual di sisi client setiap kali pengguna membuka aplikasi di browser (`recurringTransactionCheck`).
* **Penyederhanaan SQL:**
  * Data terstruktur rapi pada tabel `recurring_transactions` yang diawasi oleh backend.
  * **Otomatisasi:** Eksekusi transaksi otomatis digeser sepenuhnya ke **Cron Job** backend (misal: berjalan setiap jam 00:00). Frontend dibebaskan dari tugas memproses tagihan berulang.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape": {
    "id": "string",
    "amount": "number",
    "frequency": "daily | weekly | monthly",
    "nextOccurrence": "Date",
    "isActive": "boolean"
  },
  "new_postgresql_table": "recurring_transactions",
  "simplification_action": "Hapus script pengecekan transaksi berulang (`recurringTransactionCheck.ts` dan folder `src/jobs`) dari file inisialisasi awal frontend."
}
```

---

### 9. Ringkasan Laporan Arus Kas (`summaries`)

* **Kondisi Sekarang (Firestore):**
  Setiap kali membuka halaman laporan/laporan dashboard, frontend mengunduh seluruh baris transaksi bulan berjalan ke memori browser untuk di-loop guna menghitung rata-rata harian dan kategori terpopuler.
* **Penyederhanaan SQL:**
  * Agregasi data bulanan diproses menggunakan fitur query agregasi database PostgreSQL (`SUM`, `AVG`, `COUNT` dengan group-by).
  * Data teragregasi disimpan ke tabel `summaries` sebagai cache. Halaman laporan di frontend cukup memanggil endpoint `/api/summaries/:yearMonth` untuk merender chart.

#### Struktur Data Sekarang vs SQL Target:
```json
{
  "current_firestore_shape": {
    "totalIncome": "number",
    "totalExpense": "number",
    "incomeByCategory": "Record<categoryId, CategorySummary>",
    "expenseByCategory": "Record<categoryId, CategorySummary>"
  },
  "new_postgresql_table": "summaries",
  "simplification_action": "Hapus perhitungan perulangan array transaksi di frontend. Ambil data ringkasan instan dari endpoint summaries backend untuk performa rendering chart yang optimal."
}
```

---

## Panduan Migrasi Kode React/Vite

Ketika API Express-Supabase selesai dibuat, lakukan langkah-langkah berikut di codebase React:

1. **Ganti Service Firebase**:
   Ubah pemanggilan fungsi di dalam directory `src/services/` dari menggunakan library `firebase/firestore` menjadi pemanggilan fetch REST API (atau Axios/React Query) ke backend server Express.
2. **Hapus Logika Perhitungan di Hooks**:
   Sederhanakan hooks yang berada di [src/hooks/calculations/](file:///d:/RYAN-OPR/DEVELOP/Financial%20Plann3r/Web%20Front%20End/src/hooks/calculations) (seperti `useBudgetCalculations.ts`, `useDebtCalculations.ts`, dan `useGoalProgress.ts`). Hooks ini tidak perlu lagi melakukan perhitungan manual di browser, cukup membaca field status dan progres yang sudah dikalkulasi matang oleh backend.
3. **Optimalkan Inisialisasi Aplikasi**:
   Hapus trigger pengecekan offline/on-app-load jobs di frontend. Server backend sekarang bertanggung jawab penuh atas cron job transaksi berulang dan pembaharuan status jatuh tempo hutang.
