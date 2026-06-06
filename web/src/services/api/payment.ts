import { apiGet, apiPost, compactApiParams } from "@/services/api/request";

export type PaymentMethod = {
    type: string;
    name: string;
    enabled: boolean;
};

export type PaymentOrderStatus = "pending" | "success" | "closed";

export type PaymentOrder = {
    id: string;
    userId: string;
    credits: number;
    amountCents: number;
    paymentProvider: string;
    paymentMethod: string;
    providerTradeNo: string;
    status: PaymentOrderStatus;
    createdAt: string;
    updatedAt: string;
    paidAt: string;
};

export type PaymentOrderListResponse = {
    items: PaymentOrder[];
    total: number;
};

export type CreateEpayOrderResponse = {
    order: PaymentOrder;
    paymentUrl: string;
};

export async function createEpayOrder(token: string, payload: { credits: number; method: string }) {
    return apiPost<CreateEpayOrderResponse>("/api/payments/epay/orders", payload, token);
}

export async function fetchPaymentOrders(token: string, query: { page?: number; pageSize?: number } = {}) {
    return apiGet<PaymentOrderListResponse>("/api/payments/orders", compactApiParams(query), token);
}

export async function fetchPaymentOrder(token: string, id: string) {
    return apiGet<PaymentOrder>(`/api/payments/orders/${encodeURIComponent(id)}`, undefined, token);
}
