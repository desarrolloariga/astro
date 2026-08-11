import { AdminShell } from "@/components/admin/admin-shell"
import { KpiCards } from "@/components/admin/kpi-cards"
import { SalesChart, OrderStatusCard } from "@/components/admin/sales-chart"
import { InventoryTable } from "@/components/admin/inventory-table"
import { LowStockPanel, TopCategoriesPanel } from "@/components/admin/side-panels"

export default function AdminPage() {
  return (
    <AdminShell>
      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
        <KpiCards />

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <SalesChart />
          <OrderStatusCard />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <InventoryTable />
          <div className="flex flex-col gap-4">
            <LowStockPanel />
            <TopCategoriesPanel />
          </div>
        </div>
      </main>
    </AdminShell>
  )
}
