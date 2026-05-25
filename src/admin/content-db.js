const { run, query } = require('../libsql-client');

const DEFAULT_CONTENT = {
  hero_title:        'Платите за остров — парус и ветер включены',
  hero_subtitle:     'Прокат катамаранов для гостей острова бесплатный. Трансфер с причала Новомелково включён в выходные. Оплачиваете только проживание, снаряжение и дополнительные активности.',
  about_text:        'Парусный клуб «Остров» работает с 2014 года на настоящем острове Иваньковского водохранилища — в Тверской области, 133 км от Москвы. К нам приезжают семьями, с друзьями и небольшими командами на активный отдых: парусный спорт, кемпинг, регаты.',
  fleet_description: 'В клубе 10 катамаранов «Ветер», 2 «Бриз-Микро», «СибКат», плот «Дункель» и катер.',
  contact_phone:     '+7 (916) 000-00-00',
  contact_email:     'info@ostrov-sailing.ru',
  contact_address:   'Иваньковское водохранилище, д. Видогощи, Тверская область',
  how_to_get:        'На автомобиле: GPS-координаты 56.8xxx, 36.6xxx. Электричка: Ленинградский вокзал → Конаково, далее такси 15 мин.',
  season_dates:      'с 1 мая по 30 сентября',
};

const CONTENT_LABELS = {
  hero_title:        'Заголовок Hero-блока',
  hero_subtitle:     'Подзаголовок Hero-блока',
  about_text:        'Текст «О лагере»',
  fleet_description: 'Описание флота',
  contact_phone:     'Телефон',
  contact_email:     'Email',
  contact_address:   'Адрес',
  how_to_get:        'Как добраться',
  season_dates:      'Даты сезона',
};

async function getAllContent() {
  const rows = await query("SELECT key, value, updated_at FROM content_blocks WHERE key NOT GLOB '_*'");
  const result = { ...DEFAULT_CONTENT };
  for (const row of rows) result[row.key] = row.value;
  return result;
}

async function setContent(key, value) {
  const now = new Date().toISOString();
  await run(
    `INSERT INTO content_blocks (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now]
  );
}

async function setManyContent(updates) {
  for (const [key, value] of Object.entries(updates)) {
    await setContent(key, value);
  }
}

module.exports = { getAllContent, setContent, setManyContent, DEFAULT_CONTENT, CONTENT_LABELS };
