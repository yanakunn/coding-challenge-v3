CREATE INDEX storeid_sellersku ON generic.product (
    store_id,
    seller_sku
);

CREATE INDEX storeId_productSku ON generic.product (
    store_id, 
    product_sku
);

CREATE INDEX storeId_updatedAt ON generic.product (
    marketplace_type,
    marketplace_subtype,
    marketplace_country,
    store_id,
    updated_at
);

CREATE INDEX idx_product_isactive_storeid ON generic.product
USING btree (store_id) WHERE is_active;

CREATE INDEX idx_storeid_productid ON generic.product 
USING btree (
    store_id, 
    product_id ASC
);