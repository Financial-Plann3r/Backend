# Kontrak API (API Contract) - Express Backend

Dokumen ini mendefinisikan spesifikasi API RESTful yang disediakan oleh Express backend untuk dikonsumsi oleh Vite+React frontend.

---

## 1. Ketentuan Umum API

### A. Base URL
`http://localhost:3000/api` (atau disesuaikan dengan environment)

### B. Headers Autentikasi
Seluruh endpoint (kecuali endpoint publik seperti `/api/auth/signup` dan `/api/auth/signin`) wajib menyertakan token JWT Supabase di dalam header HTTP:
```http
Authorization: Bearer <supabase_jwt_token>
```
Backend Express memvalidasi token JWT ini menggunakan Supabase JWT Secret untuk mengekstrak `user_id` secara aman.

### C. Format Response Standar (JSON)
* **Sukses (200/201):**
  ```json
  {
    "success": true,
    "data": { ... } // Berisi objek atau array data
  }
  ```
* **Gagal (400/401/403/404/500):**
  ```json
  {
    "success": false,
    "error": {
      "code": "BAD_REQUEST",
      "message": "Pesan error deskriptif dalam Bahasa Indonesia"
    }
  }
  ```

---

## 2. Rincian Endpoint API

### A. Autentikasi (`/api/auth`)

#### 1. Registrasi Akun Baru (Email/Password)
* **Method & Path:** `POST /api/auth/signup`
* **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "status": "success",
    "message": "User signed up successfully. Check verification email if enabled.",
    "data": {
      "user": {
        "id": "95490e88-da2c-436d-b8a1-485e3d034dec",
        "email": "user@example.com"
      }
    }
  }
  ```

#### 2. Login (Email/Password)
* **Method & Path:** `POST /api/auth/signin`
* **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "status": "success",
    "message": "Logged in successfully",
    "data": {
      "user": {
        "id": "95490e88-da2c-436d-b8a1-485e3d034dec",
        "email": "user@example.com"
      },
      "session": {
        "access_token": "eyJhbGciOi...",
        "token_type": "bearer",
        "expires_in": 3600,
        "refresh_token": "..."
      }
    }
  }
  ```

#### 3. Mendapatkan Auth Profile (Berdasarkan Session Token)
* **Method & Path:** `GET /api/auth/profile`
* **Response `200 OK`:**
  ```json
  {
    "status": "success",
    "data": {
      "user": {
        "id": "95490e88-da2c-436d-b8a1-485e3d034dec",
        "email": "user@example.com",
        "role": "authenticated"
      }
    }
  }
  ```

---

### B. Pengguna & Profil (`/api/users`)

#### 1. Mendapatkan Profil User
* **Method & Path:** `GET /api/users/profile`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "email": "user@example.com",
      "displayName": "Ryan",
      "photoUrl": "https://avatar.url",
      "preferences": {
        "darkMode": false,
        "currency": "IDR",
        "timezone": "Asia/Jakarta",
        "language": "id",
        "notifications": {
          "budgetWarnings": true,
          "debtReminders": true,
          "goalMilestones": true,
          "email": false,
          "push": false
        },
        "budgetWarningThreshold": 80,
        "budgetExceededThreshold": 100
      },
      "plan": "explorer",
      "isOnboardingComplete": true,
      "onboardingCompletedAt": "2026-06-29T07:10:00Z",
      "setupProgress": {
        "walletCreated": true,
        "categoriesReviewed": true,
        "budgetRulesReviewed": false,
        "recurringReviewed": false,
        "firstTransactionAdded": false,
        "reconciliationReviewed": false,
        "checklistDismissed": false
      }
    }
  }
  ```

#### 2. Update Preferensi / Profil
* **Method & Path:** `PUT /api/users/profile`
* **Request Body:**
  ```json
  {
    "displayName": "Ryan Baru",
    "preferences": {
      "darkMode": true,
      "currency": "IDR"
    }
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "displayName": "Ryan Baru",
      "preferences": {
        "darkMode": true,
        "currency": "IDR"
      }
    }
  }
  ```

---

### C. Dompet (`/api/wallets`)

#### 1. Mendapatkan Daftar Dompet Aktif
* **Method & Path:** `GET /api/wallets`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "e3e8f85f-8ad8-4b72-b88a-92cc98e3b2e7",
        "name": "Dompet Utama",
        "type": "cash",
        "description": "Uang tunai harian",
        "balance": 1500000.00,
        "isActive": true
      }
    ]
  }
  ```

#### 2. Membuat Dompet Baru (Dibatasi Plan Limits)
* **Method & Path:** `POST /api/wallets`
* **Request Body:**
  ```json
  {
    "name": "Dompet Investasi",
    "type": "investment",
    "description": "Rekening RDN",
    "initialBalance": 500000.00
  }
  ```
* **Response `201 Created`:** Berhasil membuat dompet.
* **Response `403 Forbidden`:** Batasan limit paket tercapai.

#### 3. Memperbarui Detail Dompet
* **Method & Path:** `PUT /api/wallets/:id`
* **Request Body:**
  ```json
  {
    "name": "Dompet Utama Terupdate",
    "type": "cash",
    "description": "Uang tunai harian terbaru"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "id": "e3e8f85f-8ad8-4b72-b88a-92cc98e3b2e7",
      "name": "Dompet Utama Terupdate",
      "type": "cash",
      "description": "Uang tunai harian terbaru"
    }
  }
  ```

#### 4. Menghapus Dompet (Soft-delete)
* **Method & Path:** `DELETE /api/wallets/:id`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Dompet berhasil dihapus secara logis"
  }
  ```

---

### D. Kategori & Subkategori (`/api/categories`)

#### 1. Mendapatkan Kategori beserta Subkategori
* **Method & Path:** `GET /api/categories`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
        "name": "Makanan",
        "type": "expense",
        "icon": "utensils",
        "color": "red",
        "applyToBudget": true,
        "subcategories": [
          {
            "id": "c10d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
            "name": "Restoran",
            "isActive": true
          }
        ]
      }
    ]
  }
  ```

#### 2. Membuat Kategori Utama Baru
* **Method & Path:** `POST /api/categories`
* **Request Body:**
  ```json
  {
    "name": "Hiburan",
    "type": "expense",
    "icon": "gamepad",
    "color": "blue",
    "applyToBudget": true
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "id": "b90f1d1d-0cf3-4c91-b3b4-a21228e932b2",
      "name": "Hiburan",
      "type": "expense",
      "icon": "gamepad",
      "color": "blue",
      "applyToBudget": true,
      "subcategories": []
    }
  }
  ```

#### 3. Membuat Subkategori Baru
* **Method & Path:** `POST /api/categories/:categoryId/subcategories`
* **Request Body:**
  ```json
  {
    "name": "Gojek Food"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "id": "c10d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
      "name": "Gojek Food",
      "isActive": true
    }
  }
  ```

---

### E. Transaksi Utama (`/api/transactions`)

#### 1. Mendapatkan Daftar Transaksi (Paginated & Filtered)
* **Method & Path:** `GET /api/transactions?page=1&pageSize=20&type=expense&yearMonth=2026-06`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "transactions": [
        {
          "id": "f8a09f8c-c2b3-4621-8fcd-a11b22c33d44",
          "amount": 50000.00,
          "type": "expense",
          "categoryId": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
          "categoryName": "Makanan",
          "subcategoryId": "c10d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
          "subcategoryName": "Restoran",
          "walletId": "e3e8f85f-8ad8-4b72-b88a-92cc98e3b2e7",
          "walletName": "Dompet Utama",
          "date": "2026-06-29T12:00:00Z",
          "note": "Makan siang sushi",
          "tags": ["kuliner", "sushi"],
          "goalId": null,
          "debtId": null,
          "recurringId": null
        }
      ],
      "pagination": {
        "page": 1,
        "pageSize": 20,
        "totalCount": 142,
        "totalPages": 8,
        "hasNextPage": true
      }
    }
  }
  ```

#### 2. Membuat Transaksi Baru (Memicu Trigger DB & Alokasi)
* **Method & Path:** `POST /api/transactions`
* **Request Body:**
  ```json
  {
    "amount": 200000.00,
    "type": "expense",
    "categoryId": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
    "walletId": "e3e8f85f-8ad8-4b72-b88a-92cc98e3b2e7",
    "date": "2026-06-29T14:00:00Z",
    "note": "Belanja Mingguan",
    "tags": ["bulanan"],
    "subcategoryId": null,
    "goalId": null,
    "debtId": null,
    "recurringId": null
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "id": "f8a09f8c-c2b3-4621-8fcd-a11b22c33d44",
      "amount": 200000.00,
      "type": "expense",
      "categoryId": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
      "walletId": "e3e8f85f-8ad8-4b72-b88a-92cc98e3b2e7",
      "date": "2026-06-29T14:00:00Z",
      "note": "Belanja Mingguan",
      "tags": ["bulanan"]
    }
  }
  ```

#### 3. Menghapus / Membatalkan Transaksi
* **Method & Path:** `DELETE /api/transactions/:id`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Transaksi berhasil dihapus dan saldo dompet telah disesuaikan"
  }
  ```

---

### F. Hutang & Piutang (`/api/debts`)

#### 1. Mendapatkan Daftar Hutang dengan Virtual Fields (BE-Calculated)
* **Method & Path:** `GET /api/debts`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "d0e1f2a3-b4c5-6d7e-8f9a-0b1c2d3e4f5a",
        "type": "debt",
        "partyName": "Bank Mandiri",
        "partyContact": "021-14000",
        "principalAmount": 10000000.00,
        "interestConfig": {
          "type": "flat",
          "rate": 5.0
        },
        "interestRate": 5.0,
        "status": "active",
        "startDate": "2026-01-01T00:00:00Z",
        "dueDate": "2027-01-01T00:00:00Z",
        "sourceCategoryId": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
        "note": "Pinjaman modal usaha",
        "remainingPrincipal": 6000000.00,
        "remainingTotal": 6300000.00,
        "totalAmount": 10500000.00,
        "paymentProgress": 40.0,
        "daysUntilDue": 185,
        "isNearDue": false,
        "isOverdue": false
      }
    ]
  }
  ```

#### 2. Membuat Utang / Piutang Baru
* **Method & Path:** `POST /api/debts`
* **Request Body:**
  ```json
  {
    "type": "debt",
    "partyName": "Bank Mandiri",
    "partyContact": "021-14000",
    "principalAmount": 10000000.00,
    "interestConfig": {
      "type": "flat",
      "rate": 5.0
    },
    "startDate": "2026-01-01T00:00:00Z",
    "dueDate": "2027-01-01T00:00:00Z",
    "sourceCategoryId": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
    "note": "Pinjaman modal usaha"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "id": "d0e1f2a3-b4c5-6d7e-8f9a-0b1c2d3e4f5a",
      "type": "debt",
      "partyName": "Bank Mandiri",
      "principalAmount": 10000000.00,
      "status": "active"
    }
  }
  ```

#### 3. Melakukan Pembayaran Hutang (Backend FIFO Transactional)
* **Method & Path:** `POST /api/debts/:debtId/payments`
* **Request Body:**
  ```json
  {
    "amount": 1000000.00,
    "walletId": "e3e8f85f-8ad8-4b72-b88a-92cc98e3b2e7",
    "paymentDate": "2026-06-29T14:00:00Z",
    "paymentType": "principal",
    "note": "Cicilan ke-5"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "message": "Pembayaran utang berhasil dicatat secara FIFO.",
    "data": {
      "transactionId": "f8a09f8c-c2b3-4621-8fcd-a11b22c33d44",
      "mutations": [
        {
          "id": "m1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c",
          "amount": 1000000.00,
          "type": "decrease",
          "note": "Cicilan ke-5 (Principal)"
        }
      ]
    }
  }
  ```

---

### G. Target Tabungan (`/api/goals`)

#### 1. Mendapatkan Goals dengan Dynamic Calculations
* **Method & Path:** `GET /api/goals`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "g1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c",
        "name": "Beli Laptop",
        "description": "Menabung untuk laptop kerja",
        "targetAmount": 15000000.00,
        "currentAmount": 3000000.00,
        "startDate": "2026-06-01T00:00:00Z",
        "deadline": "2026-12-31T00:00:00Z",
        "status": "active",
        "priority": "high",
        "icon": "laptop",
        "color": "blue",
        "categoryId": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
        "savingWalletId": "e3e8f85f-8ad8-4b72-b88a-92cc98e3b2e7",
        "remainingAmount": 12000000.00,
        "percentageComplete": 20.0,
        "daysUntilDeadline": 185,
        "monthlyRequired": 2000000.00,
        "isOnTrack": true
      }
    ]
  }
  ```

#### 2. Membuat Target Tabungan Baru
* **Method & Path:** `POST /api/goals`
* **Request Body:**
  ```json
  {
    "name": "Beli Laptop",
    "description": "Menabung untuk laptop kerja",
    "targetAmount": 15000000.00,
    "startDate": "2026-06-01T00:00:00Z",
    "deadline": "2026-12-31T00:00:00Z",
    "priority": "high",
    "icon": "laptop",
    "color": "blue",
    "categoryId": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
    "savingWalletId": "e3e8f85f-8ad8-4b72-b88a-92cc98e3b2e7"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "success": true,
    "data": {
      "id": "g1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c",
      "name": "Beli Laptop",
      "targetAmount": 15000000.00,
      "status": "active"
    }
  }
  ```

---

### H. Laporan Bulanan (`/api/summaries`)

#### 1. Mendapatkan Ringkasan Bulanan (Data Cache Teragregasi)
* **Method & Path:** `GET /api/summaries/:yearMonth`
* **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "yearMonth": "2026-06",
      "totalIncome": 12500000.00,
      "totalExpense": 8000000.00,
      "balance": 4500000.00,
      "savingsRate": 36.0,
      "budgetUtilization": 72.5,
      "avgDailyExpense": 266666.67,
      "avgDailySpendingExpense": 200000.00,
      "totalInvestmentExpense": 1000000.00,
      "avgTransactionAmount": 277777.78,
      "transactionCount": {
        "income": 3,
        "expense": 42,
        "total": 45
      },
      "incomeByCategory": {
        "Gaji": 10000000.00,
        "Investasi": 2500000.00
      },
      "expenseByCategory": {
        "Makanan": 2500000.00,
        "Transportasi": 1500000.00
      },
      "expenseByWallet": {
        "Dompet Utama": 5000000.00,
        "Dompet Investasi": 3000000.00
      },
      "topExpenseCategory": {
        "categoryId": "a90f1d1d-0cf3-4c91-b3b4-a21228e932b1",
        "categoryName": "Makanan",
        "amount": 2500000.00,
        "percentage": 31.25
      },
      "topInvestmentSubcategory": {
        "subcategoryId": "invest-sub-123",
        "subcategoryName": "Reksadana Saham",
        "amount": 1000000.00,
        "percentage": 12.5
      },
      "debtTransactions": {
        "totalDebtPayments": 1000000.00,
        "totalLoanPayments": 0.00,
        "debtPaymentCount": 1,
        "loanPaymentCount": 0
      }
    }
  }
  ```

#### 2. Memicu Kalkulasi Ulang Laporan secara Paksa
* **Method & Path:** `POST /api/summaries/:yearMonth/recalculate`
* **Response `200 OK`:** 
  ```json
  {
    "success": true,
    "message": "Kalkulasi ulang berhasil dilakukan"
  }
  ```
