-- ==========================================
-- SCHEMA DATABASE FINANCIAL PLANNER (POSTGRESQL)
-- Lokasi: docs/database_schema.sql
-- Untuk digunakan di Supabase / PostgreSQL
-- ==========================================

-- 1. TABEL: users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    photo_url VARCHAR(255),
    preferences JSONB DEFAULT '{
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
    }'::jsonb,
    plan VARCHAR(50) DEFAULT 'free', -- explorer, pro, elite, free, premium, enterprise
    plan_expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    is_onboarding_complete BOOLEAN DEFAULT false,
    onboarding_completed_at TIMESTAMP WITH TIME ZONE,
    setup_progress JSONB DEFAULT '{
        "walletCreated": false,
        "categoriesReviewed": false,
        "budgetRulesReviewed": false,
        "recurringReviewed": false,
        "firstTransactionAdded": false,
        "reconciliationReviewed": false,
        "checklistDismissed": false
    }'::jsonb,
    referral_code VARCHAR(100) UNIQUE,
    referred_by UUID,
    referral_count INT DEFAULT 0,
    referral_reward_claimed BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABEL: categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
    icon VARCHAR(100) NOT NULL,
    color VARCHAR(20) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    apply_to_budget BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indeks untuk categories
CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE UNIQUE INDEX idx_unique_active_category ON categories(user_id, name, type) WHERE is_deleted = false;

-- 3. TABEL: subcategories
CREATE TABLE subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indeks untuk subcategories
CREATE INDEX idx_subcategories_category_id ON subcategories(category_id);
CREATE INDEX idx_subcategories_user_id ON subcategories(user_id);
CREATE UNIQUE INDEX idx_unique_active_subcategory ON subcategories(category_id, name) WHERE is_deleted = false;

-- 4. TABEL: wallets
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('cash', 'debit', 'credit', 'ewallet', 'investment')),
    description TEXT,
    balance NUMERIC(15, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indeks untuk wallets
CREATE INDEX idx_wallets_user_id ON wallets(user_id);

-- 5. TABEL: debt_loans (Master Hutang & Piutang)
CREATE TABLE debt_loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('debt', 'loan')), -- debt = hutang kita, loan = piutang (kita meminjamkan)
    name VARCHAR(255) NOT NULL,
    contact VARCHAR(100),
    principal_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    source_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    interest_config JSONB DEFAULT '{"type": "none", "rate": 0}'::jsonb, -- Konfigurasi bunga (Pendekatan A JSONB: type, rate, period)
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'overdue', 'cancelled')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    note TEXT,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_debt_loans_user_id ON debt_loans(user_id);

-- 6. TABEL: recurring_transactions (Transaksi Berulang)
CREATE TABLE recurring_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
    category_id UUID NOT NULL REFERENCES categories(id),
    subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
    wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    amount NUMERIC(15, 2) NOT NULL,
    frequency VARCHAR(50) NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'yearly')),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    next_occurrence TIMESTAMP WITH TIME ZONE NOT NULL,
    day_of_month INT CHECK (day_of_month BETWEEN 1 AND 31),
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Minggu, 1=Senin...
    is_active BOOLEAN DEFAULT true,
    last_generated_date TIMESTAMP WITH TIME ZONE,
    total_generated INT DEFAULT 0,
    note TEXT,
    tags VARCHAR[] DEFAULT '{}',
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recurring_user_id ON recurring_transactions(user_id);

-- 7. TABEL: goals (Target Tabungan)
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    color VARCHAR(20),
    target_amount NUMERIC(15, 2) NOT NULL,
    current_amount NUMERIC(15, 2) DEFAULT 0.00,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL, -- Kategori pemicu alokasi otomatis jika ada
    saving_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL, -- Dompet khusus tabungan target jika ada
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_goals_user_id ON goals(user_id);

-- 8. TABEL: transactions (Transaksi Utama - Menyederhanakan relasi B)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
    category_id UUID NOT NULL REFERENCES categories(id),
    subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
    wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    note TEXT,
    tags VARCHAR[] DEFAULT '{}',
    -- Relasi opsional terpisah (Pendekatan B)
    goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
    debt_id UUID REFERENCES debt_loans(id) ON DELETE SET NULL,
    recurring_id UUID REFERENCES recurring_transactions(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_category_id ON transactions(category_id);
CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_goal_id ON transactions(goal_id);
CREATE INDEX idx_transactions_debt_id ON transactions(debt_id);
CREATE INDEX idx_transactions_date ON transactions(date);

-- 9. TABEL: debt_loan_mutations (Histori Detail Tambah & Bayar Hutang/Piutang)
CREATE TABLE debt_loan_mutations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    debt_loan_id UUID NOT NULL REFERENCES debt_loans(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL, -- Opsional: Terhubung ke transaksi dompet riil
    amount NUMERIC(15, 2) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('increase', 'decrease', 'interest')), -- 'increase' (tambah pokok), 'decrease' (bayar/cicil), 'interest' (bunga berjalan)
    date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note TEXT,
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_debt_loan_mutations_debt_loan_id ON debt_loan_mutations(debt_loan_id);
CREATE INDEX idx_debt_loan_mutations_transaction_id ON debt_loan_mutations(transaction_id);

-- 10. TABEL: transaction_budget_allocations (Untuk envelope budgeting manual per kategori jika ada)
CREATE TABLE transaction_budget_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. TABEL: budgets (Anggaran Amplop / Kategori Bulanan)
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL, -- format 'YYYY-MM'
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(15, 2) DEFAULT 0.00,
    spent_amount NUMERIC(15, 2) DEFAULT 0.00,
    remaining_amount NUMERIC(15, 2) GENERATED ALWAYS AS (allocated_amount - spent_amount) STORED,
    status VARCHAR(50) DEFAULT 'on-track' CHECK (status IN ('on-track', 'warning', 'exceeded')),
    alerts JSONB DEFAULT '[]'::jsonb, -- detail alert terpicu
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_month_category UNIQUE (user_id, year_month, category_id)
);

CREATE INDEX idx_budgets_user_month ON budgets(user_id, year_month);

-- 12. TABEL: budget_rules (Aturan Alokasi Anggaran Bulanan)
CREATE TABLE budget_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL,
    rules JSONB NOT NULL, -- array of rules [{categoryId: '...', categoryName: '...', percentage: 50}]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_month_rules UNIQUE (user_id, year_month)
);

-- 13. TABEL: summaries (Ringkasan Bulanan - Cache Hasil Agregasi)
CREATE TABLE summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year_month VARCHAR(7) NOT NULL,
    total_income NUMERIC(15, 2) DEFAULT 0.00,
    total_expense NUMERIC(15, 2) DEFAULT 0.00,
    balance NUMERIC(15, 2) GENERATED ALWAYS AS (total_income - total_expense) STORED,
    savings_rate NUMERIC(5, 2) DEFAULT 0.00, -- persentase tabungan
    budget_utilization NUMERIC(5, 2) DEFAULT 0.00, -- persentase anggaran terpakai
    income_by_category JSONB DEFAULT '{}'::jsonb,
    expense_by_category JSONB DEFAULT '{}'::jsonb,
    expense_by_wallet JSONB DEFAULT '{}'::jsonb,
    transaction_count JSONB DEFAULT '{"income": 0, "expense": 0, "total": 0}'::jsonb,
    avg_daily_expense NUMERIC(15, 2) DEFAULT 0.00,
    avg_daily_spending_expense NUMERIC(15, 2) DEFAULT 0.00,
    total_investment_expense NUMERIC(15, 2) DEFAULT 0.00,
    avg_transaction_amount NUMERIC(15, 2) DEFAULT 0.00,
    top_expense_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    top_spending_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    top_investment_subcategory_id UUID REFERENCES subcategories(id) ON DELETE SET NULL,
    top_income_category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    debt_transactions JSONB DEFAULT '{"totalDebtPayments": 0, "totalLoanPayments": 0, "debtPaymentCount": 0, "loanPaymentCount": 0}'::jsonb,
    is_calculated BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_month_summary UNIQUE (user_id, year_month)
);

-- 14. TABEL: notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- budget-warning, debt-due-soon, goal-milestone, etc.
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    related_entity_id UUID,
    related_entity_type VARCHAR(50),
    action_url VARCHAR(255),
    action_label VARCHAR(100),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    group_id VARCHAR(100),
    metadata JSONB DEFAULT '{}'::jsonb,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = false;

-- 14b. TABEL: fcm_tokens (Token Push Notification Device User)
CREATE TABLE fcm_tokens (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL,
    device_type VARCHAR(50), -- web, android, ios
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, token)
);

-- 15. TABEL: activity_logs
CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL, -- login, transaction-created, budget-allocated...
    description TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    user_agent VARCHAR(255),
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_user_created ON activity_logs(user_id, created_at DESC);


-- =========================================================================
-- DATABASE TRIGGERS: OTOMATISASI DOMPET, ANGGARAN, GOAL & DEBT/LOAN STATUS
-- =========================================================================

-- A. FUNGSI TRIGGER: update_wallet_balance_on_transaction
CREATE OR REPLACE FUNCTION fn_update_wallet_balance_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
    -- KASUS INSERT (Transaksi Baru)
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.is_deleted = false AND NEW.wallet_id IS NOT NULL) THEN
            IF (NEW.type = 'income') THEN
                UPDATE wallets SET balance = balance + NEW.amount WHERE id = NEW.wallet_id;
            ELSIF (NEW.type = 'expense') THEN
                UPDATE wallets SET balance = balance - NEW.amount WHERE id = NEW.wallet_id;
            END IF;
        END IF;

    -- KASUS UPDATE (Transaksi Diubah)
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Batalkan efek transaksi lama (OLD)
        IF (OLD.is_deleted = false AND OLD.wallet_id IS NOT NULL) THEN
            IF (OLD.type = 'income') THEN
                UPDATE wallets SET balance = balance - OLD.amount WHERE id = OLD.wallet_id;
            ELSIF (OLD.type = 'expense') THEN
                UPDATE wallets SET balance = balance + OLD.amount WHERE id = OLD.wallet_id;
            END IF;
        END IF;

        -- Terapkan efek transaksi baru (NEW)
        IF (NEW.is_deleted = false AND NEW.wallet_id IS NOT NULL) THEN
            IF (NEW.type = 'income') THEN
                UPDATE wallets SET balance = balance + NEW.amount WHERE id = NEW.wallet_id;
            ELSIF (NEW.type = 'expense') THEN
                UPDATE wallets SET balance = balance - NEW.amount WHERE id = NEW.wallet_id;
            END IF;
        END IF;

    -- KASUS DELETE
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.is_deleted = false AND OLD.wallet_id IS NOT NULL) THEN
            IF (OLD.type = 'income') THEN
                UPDATE wallets SET balance = balance - OLD.amount WHERE id = OLD.wallet_id;
            ELSIF (OLD.type = 'expense') THEN
                UPDATE wallets SET balance = balance + OLD.amount WHERE id = OLD.wallet_id;
            END IF;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- TRIGGER pemicu untuk dompet
CREATE TRIGGER trg_wallet_balance_adjustment
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_update_wallet_balance_on_transaction();


-- B. FUNGSI TRIGGER: update_budget_spent_on_transaction
CREATE OR REPLACE FUNCTION fn_update_budget_spent_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_year_month VARCHAR(7);
    v_user_id UUID;
BEGIN
    -- Tentukan user_id dan year_month yang bersangkutan
    IF (TG_OP = 'INSERT') THEN
        v_year_month := to_char(NEW.date, 'YYYY-MM');
        v_user_id := NEW.user_id;
    ELSE
        v_year_month := to_char(OLD.date, 'YYYY-MM');
        v_user_id := OLD.user_id;
    END IF;

    -- KASUS INSERT
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.is_deleted = false AND NEW.type = 'expense') THEN
            INSERT INTO budgets (user_id, year_month, category_id, spent_amount)
            VALUES (NEW.user_id, v_year_month, NEW.category_id, NEW.amount)
            ON CONFLICT (user_id, year_month, category_id)
            DO UPDATE SET spent_amount = budgets.spent_amount + NEW.amount;
        END IF;

    -- KASUS UPDATE
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Kurangi efek transaksi lama
        IF (OLD.is_deleted = false AND OLD.type = 'expense') THEN
            UPDATE budgets
            SET spent_amount = spent_amount - OLD.amount
            WHERE user_id = OLD.user_id AND year_month = v_year_month AND category_id = OLD.category_id;
        END IF;

        -- Tambah efek transaksi baru
        IF (NEW.is_deleted = false AND NEW.type = 'expense') THEN
            INSERT INTO budgets (user_id, year_month, category_id, spent_amount)
            VALUES (NEW.user_id, v_year_month, NEW.category_id, NEW.amount)
            ON CONFLICT (user_id, year_month, category_id)
            DO UPDATE SET spent_amount = budgets.spent_amount + NEW.amount;
        END IF;

    -- KASUS DELETE
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.is_deleted = false AND OLD.type = 'expense') THEN
            UPDATE budgets
            SET spent_amount = spent_amount - OLD.amount
            WHERE user_id = OLD.user_id AND year_month = v_year_month AND category_id = OLD.category_id;
        END IF;
    END IF;

    -- Update status budget berdasarkan rasio (hanya untuk kategori yang terdampak)
    UPDATE budgets
    SET status = CASE
        WHEN spent_amount >= allocated_amount AND allocated_amount > 0 THEN 'exceeded'
        WHEN spent_amount >= (allocated_amount * 0.8) AND allocated_amount > 0 THEN 'warning'
        ELSE 'on-track'
    END
    WHERE user_id = v_user_id
      AND year_month = v_year_month
      AND category_id IN (
          CASE WHEN TG_OP = 'DELETE' THEN OLD.category_id ELSE NEW.category_id END,
          CASE WHEN TG_OP = 'INSERT' THEN NEW.category_id ELSE OLD.category_id END
      );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- TRIGGER pemicu untuk anggaran
CREATE TRIGGER trg_budget_spent_adjustment
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_update_budget_spent_on_transaction();


-- C. FUNGSI TRIGGER: update_goal_current_amount_on_transaction
CREATE OR REPLACE FUNCTION fn_update_goal_current_amount_on_transaction()
RETURNS TRIGGER AS $$
DECLARE
    v_goal_id UUID;
BEGIN
    -- Identifikasi goal yang terdampak
    IF (TG_OP = 'INSERT') THEN
        v_goal_id := NEW.goal_id;
    ELSE
        v_goal_id := OLD.goal_id;
    END IF;

    -- KASUS INSERT
    IF (TG_OP = 'INSERT') THEN
        IF (NEW.is_deleted = false AND NEW.goal_id IS NOT NULL) THEN
            -- Pengeluaran = Menabung (menambah tabungan)
            -- Pendapatan = Menarik tabungan (mengurangi tabungan)
            IF (NEW.type = 'expense') THEN
                UPDATE goals SET current_amount = current_amount + NEW.amount WHERE id = NEW.goal_id;
            ELSIF (NEW.type = 'income') THEN
                UPDATE goals SET current_amount = current_amount - NEW.amount WHERE id = NEW.goal_id;
            END IF;
        END IF;

    -- KASUS UPDATE
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Batalkan efek transaksi lama (OLD)
        IF (OLD.is_deleted = false AND OLD.goal_id IS NOT NULL) THEN
            IF (OLD.type = 'expense') THEN
                UPDATE goals SET current_amount = current_amount - OLD.amount WHERE id = OLD.goal_id;
            ELSIF (OLD.type = 'income') THEN
                UPDATE goals SET current_amount = current_amount + OLD.amount WHERE id = OLD.goal_id;
            END IF;
        END IF;

        -- Terapkan efek transaksi baru (NEW)
        IF (NEW.is_deleted = false AND NEW.goal_id IS NOT NULL) THEN
            IF (NEW.type = 'expense') THEN
                UPDATE goals SET current_amount = current_amount + NEW.amount WHERE id = NEW.goal_id;
            ELSIF (NEW.type = 'income') THEN
                UPDATE goals SET current_amount = current_amount - NEW.amount WHERE id = NEW.goal_id;
            END IF;
        END IF;

    -- KASUS DELETE
    ELSIF (TG_OP = 'DELETE') THEN
        IF (OLD.is_deleted = false AND OLD.goal_id IS NOT NULL) THEN
            IF (OLD.type = 'expense') THEN
                UPDATE goals SET current_amount = current_amount - OLD.amount WHERE id = OLD.goal_id;
            ELSIF (OLD.type = 'income') THEN
                UPDATE goals SET current_amount = current_amount + OLD.amount WHERE id = OLD.goal_id;
            END IF;
        END IF;
    END IF;

    -- Otomatis memperbarui status goal jika sudah mencapai target
    IF (v_goal_id IS NOT NULL) THEN
        UPDATE goals
        SET
            status = CASE
                WHEN current_amount >= target_amount THEN 'completed'::varchar
                ELSE 'active'::varchar
            END,
            completed_at = CASE
                WHEN current_amount >= target_amount THEN CURRENT_TIMESTAMP
                ELSE NULL
            END
        WHERE id = v_goal_id;
    END IF;

    -- Jika ada perubahan ke goal lain pada saat UPDATE (misal goal_id dipindahkan)
    IF (TG_OP = 'UPDATE' AND NEW.goal_id IS NOT NULL AND NEW.goal_id != COALESCE(OLD.goal_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
        UPDATE goals
        SET
            status = CASE
                WHEN current_amount >= target_amount THEN 'completed'::varchar
                ELSE 'active'::varchar
            END,
            completed_at = CASE
                WHEN current_amount >= target_amount THEN CURRENT_TIMESTAMP
                ELSE NULL
            END
        WHERE id = NEW.goal_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- TRIGGER pemicu untuk goal
CREATE TRIGGER trg_goal_current_amount_adjustment
AFTER INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION fn_update_goal_current_amount_on_transaction();


-- D. FUNGSI TRIGGER: update_debt_loan_status_on_mutation (Mengelola lifecycle Utang/Piutang)
CREATE OR REPLACE FUNCTION fn_update_debt_loan_status_on_mutation()
RETURNS TRIGGER AS $$
DECLARE
    v_debt_loan_id UUID;
    v_remaining NUMERIC(15, 2);
BEGIN
    -- Identifikasi debt_loan_id yang terdampak
    IF (TG_OP = 'INSERT') THEN
        v_debt_loan_id := NEW.debt_loan_id;
    ELSE
        v_debt_loan_id := OLD.debt_loan_id;
    END IF;

    -- Hitung sisa saldo utang/piutang secara dinamis
    SELECT
        COALESCE(SUM(CASE WHEN type IN ('increase', 'interest') THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN type = 'decrease' THEN amount ELSE 0 END), 0)
    INTO v_remaining
    FROM debt_loan_mutations
    WHERE debt_loan_id = v_debt_loan_id AND is_deleted = false;

    -- Otomatis update status master debt_loans
    IF (v_remaining <= 0.00) THEN
        UPDATE debt_loans
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = v_debt_loan_id;
    ELSE
        UPDATE debt_loans
        SET status = 'active', completed_at = NULL
        WHERE id = v_debt_loan_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- TRIGGER pemicu untuk status debt/loan
CREATE TRIGGER trg_debt_loan_status_adjustment
AFTER INSERT OR UPDATE OR DELETE ON debt_loan_mutations
FOR EACH ROW
EXECUTE FUNCTION fn_update_debt_loan_status_on_mutation();
