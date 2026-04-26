import "./globals.css";

export const metadata = {
  title: "Парусный Клуб «Остров» — Рассчитать стоимость",
  description:
    "Современный сайт Парусного Клуба «Остров»: флот, мероприятия, калькулятор стоимости и заявка.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
