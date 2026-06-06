"use client";

import { App, Button, Card, Empty, InputNumber, Radio, Space, Table, Tag, Typography } from "antd";
import { CreditCard, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CreditSymbol } from "@/constant/credits";
import { createEpayOrder, fetchPaymentOrders, type PaymentOrder } from "@/services/api/payment";
import { fetchCurrentUser } from "@/services/api/auth";
import { useConfigStore } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";

export default function BillingPage() {
    const { message } = App.useApp();
    const token = useUserStore((state) => state.token);
    const user = useUserStore((state) => state.user);
    const setSession = useUserStore((state) => state.setSession);
    const publicSettings = useConfigStore((state) => state.publicSettings);
    const loadPublicSettings = useConfigStore((state) => state.loadPublicSettings);
    const epay = publicSettings?.payment?.epay;
    const methods = useMemo(() => (epay?.methods || []).filter((item) => item.enabled), [epay?.methods]);
    const [credits, setCredits] = useState(epay?.minCredits || 100);
    const [method, setMethod] = useState("");
    const [orders, setOrders] = useState<PaymentOrder[]>([]);
    const [loading, setLoading] = useState(false);
    const [paying, setPaying] = useState(false);

    useEffect(() => {
        void loadPublicSettings();
    }, [loadPublicSettings]);

    useEffect(() => {
        if (epay?.minCredits && credits < epay.minCredits) setCredits(epay.minCredits);
    }, [credits, epay?.minCredits]);

    useEffect(() => {
        if (!method && methods[0]) setMethod(methods[0].type);
    }, [method, methods]);

    useEffect(() => {
        if (!token) return;
        setLoading(true);
        void Promise.all([fetchPaymentOrders(token, { pageSize: 20 }), fetchCurrentUser(token)])
            .then(([orderData, nextUser]) => {
                setOrders(orderData.items);
                setSession(token, nextUser);
            })
            .catch((error) => message.error(error instanceof Error ? error.message : "读取充值记录失败"))
            .finally(() => setLoading(false));
    }, [message, setSession, token]);

    const amount = ((credits || 0) * (epay?.pricePerCredit || 0)).toFixed(2);
    const canPay = Boolean(token && epay?.enabled && method && credits >= (epay?.minCredits || 1));

    const submit = async () => {
        if (!token) {
            message.error("请先登录");
            return;
        }
        setPaying(true);
        try {
            const result = await createEpayOrder(token, { credits, method });
            window.location.href = result.paymentUrl;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建订单失败");
        } finally {
            setPaying(false);
        }
    };

    return (
        <main className="h-full overflow-y-auto bg-[#f5f6f8] px-4 py-6 text-stone-950 sm:px-6 lg:px-8 dark:bg-stone-950 dark:text-stone-100">
            <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <Card>
                    <Space orientation="vertical" size={18} className="w-full">
                        <div>
                            <Typography.Text type="secondary">当前余额</Typography.Text>
                            <div className="mt-2 flex items-center gap-2 text-3xl font-semibold">
                                <CreditSymbol />
                                {user?.credits?.toLocaleString() || 0}
                            </div>
                        </div>
                        {epay?.enabled ? (
                            <>
                                <div>
                                    <Typography.Text strong>充值点数</Typography.Text>
                                    <InputNumber min={epay.minCredits || 1} precision={0} value={credits} onChange={(value) => setCredits(Number(value) || epay.minCredits || 1)} className="mt-2 !w-full" addonAfter="点" />
                                </div>
                                <div>
                                    <Typography.Text strong>支付方式</Typography.Text>
                                    <Radio.Group className="mt-2 grid w-full gap-2" value={method} onChange={(event) => setMethod(event.target.value)}>
                                        {methods.map((item) => (
                                            <Radio.Button key={item.type} value={item.type} className="!h-auto !rounded-md !px-3 !py-2">
                                                {item.name}
                                            </Radio.Button>
                                        ))}
                                    </Radio.Group>
                                </div>
                                <div className="rounded-md bg-stone-50 p-3 text-sm dark:bg-stone-900">
                                    应付金额 <span className="font-semibold">¥{amount}</span>
                                </div>
                                <Button type="primary" size="large" block icon={<CreditCard className="size-4" />} loading={paying} disabled={!canPay} onClick={() => void submit()}>
                                    去支付
                                </Button>
                            </>
                        ) : (
                            <div className="rounded-md border border-dashed border-stone-200 p-4 text-sm text-stone-500 dark:border-stone-800 dark:text-stone-400">暂未开启在线充值</div>
                        )}
                    </Space>
                </Card>
                <Card title={<span className="inline-flex items-center gap-2"><Wallet className="size-4" />充值记录</span>}>
                    <Table
                        rowKey="id"
                        loading={loading}
                        dataSource={orders}
                        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无充值记录" /> }}
                        pagination={false}
                        columns={[
                            { title: "订单号", dataIndex: "id", render: (value) => <Typography.Text copyable>{value}</Typography.Text> },
                            { title: "点数", dataIndex: "credits", width: 100 },
                            { title: "金额", dataIndex: "amountCents", width: 120, render: (value) => `¥${(Number(value || 0) / 100).toFixed(2)}` },
                            { title: "状态", dataIndex: "status", width: 110, render: (value) => <Tag color={value === "success" ? "success" : "default"}>{value === "success" ? "已支付" : value === "pending" ? "待支付" : "已关闭"}</Tag> },
                            { title: "创建时间", dataIndex: "createdAt", width: 210 },
                        ]}
                    />
                </Card>
            </div>
        </main>
    );
}
