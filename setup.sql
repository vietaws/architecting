CREATE TABLE IF NOT EXISTS providers (
    provider_id VARCHAR(50) PRIMARY KEY,
    provider_name VARCHAR(255) NOT NULL,
    provider_city VARCHAR(100)
);
