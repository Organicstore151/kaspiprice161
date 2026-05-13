import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.KASPI_TOKEN;

const kaspi = axios.create({
  baseURL: "https://kaspi.kz/shop/api/v2",
  headers: {
    "X-Auth-Token": API_TOKEN,
    "Content-Type": "application/vnd.api+json",
  },
});

async function getOrders(dateFrom, dateTo) {
  const res = await kaspi.get("/orders", {
    params: {
      "page[number]": 0,
      "page[size]": 100,
      "filter[orders][status]": "COMPLETED",
      "filter[orders][creationDate][$ge]": dateFrom,
      "filter[orders][creationDate][$le]": dateTo,
    },
  });
  return res.data.data;
}

async function getOrderEntries(orderId) {
  const res = await kaspi.get(`/orders/${orderId}/entries`);
  return res.data.data;
}

async function getProductByEntryId(entryId) {
  const res = await kaspi.get(`/orderentries/${entryId}/product`);
  const attrs = res.data.data?.attributes;
  return {
    name: attrs?.name,
    code: attrs?.code,
    manufacturer: attrs?.manufacturer,
  };
}

app.get("/orders", async (req, res) => {
  try {
    const now = Date.now();
    const dateTo = req.query.dateTo ? parseInt(req.query.dateTo) : now;
    const dateFrom = req.query.dateFrom
      ? parseInt(req.query.dateFrom)
      : now - 14 * 24 * 60 * 60 * 1000;

    const allOrders = await getOrders(dateFrom, dateTo);
    const orders = allOrders.filter((o) => o.attributes.status === "COMPLETED");

    const result = await Promise.all(
      orders.map(async (order) => {
        const attrs = order.attributes;

        const entries = await getOrderEntries(order.id);
        const items = await Promise.all(
          entries.map(async (entry) => {
            const product = await getProductByEntryId(entry.id);
            return {
              quantity: entry.attributes?.quantity,
              totalPrice: entry.attributes?.totalPrice,
              product,
            };
          })
        );

        // Форматируем дату
        const formatDate = (timestamp) => {
          if (!timestamp) return null;
          return new Date(timestamp).toLocaleString("ru-KZ");
        };

        return {
          orderId: order.id,
          orderCode: attrs.code,
          status: attrs.status,
          state: attrs.state,
          totalPrice: attrs.totalPrice,
          customer: attrs.customer.name,
          city: attrs.deliveryAddress.town,
          deliveryMode: attrs.deliveryMode,
          deliveryCost: attrs.deliveryCostForSeller,
          creationDate: formatDate(attrs.creationDate),
          completionDate: formatDate(attrs.completionDate),  // дата выдачи
          deliveryDate: formatDate(attrs.deliveryDate),      // дата доставки
          items,
        };
      })
    );

    res.json(result);
  } catch (e) {
    console.error("ERROR:", e.response?.data || e.message);
    res.status(500).json({
      error: e.message,
      kaspiError: e.response?.data,
    });
  }
});

app.listen(PORT, () => {
  console.log("Server started on port", PORT);
});
