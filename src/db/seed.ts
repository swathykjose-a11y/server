import { db } from "./index.js";
import {
  productsTable,
  productVariantsTable,
  collectionsTable,
  collectionProductsTable,
  cmsSectionsTable,
  adminsTable,
} from "./schema/index.js";
import { hashPassword } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

async function seed() {
  logger.info("[DB] Seeding database with initial catalog...");

  // 1. Collections
  const collections = [
    {
      id: "col_earrings",
      handle: "earrings",
      title: "Earrings",
      description: "Handcrafted hoops, huggies, drops, and studs designed for effortless everyday wear.",
      imageUrl: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766225/dainty-dazzle/dainty-dazzle/06-product-earrings-model.jpg",
      imageAlt: "Dainty Dazzle Earrings Collection",
    },
    {
      id: "col_necklaces",
      handle: "necklaces",
      title: "Necklaces",
      description: "Sculptural chains, luminous pearl pendants, and dainty chokers to layer or wear alone.",
      imageUrl: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766227/dainty-dazzle/dainty-dazzle/07-product-snake-chain.jpg",
      imageAlt: "Dainty Dazzle Necklaces Collection",
    },
    {
      id: "col_new_arrivals",
      handle: "new-arrivals",
      title: "New Arrivals",
      description: "Freshly added designs reflecting understated luxury and contemporary elegance.",
      imageUrl: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766223/dainty-dazzle/dainty-dazzle/05-product-pearl-details.jpg",
      imageAlt: "Dainty Dazzle New Arrivals",
    },
  ];

  for (const col of collections) {
    await db
      .insert(collectionsTable)
      .values(col)
      .onConflictDoUpdate({ target: collectionsTable.id, set: col });
  }

  // 2. Products
  const products = [
    {
      id: "prod_01",
      handle: "golden-aura-twisted-hoops",
      title: "Golden Aura Twisted Hoops",
      descriptionHtml:
        "<p>Sculptural twisted hoop earrings crafted with 18k gold vermeil over sterling silver. Designed to catch light with every turn, adding effortless warmth and modern elegance to any outfit.</p><p>Hypoallergenic, water-resistant, and lightweight for all-day comfort.</p>",
      availableForSale: true,
      isActive: true,
      totalInventory: 25,
      minPrice: "899.00",
      compareAtPrice: "1499.00",
      currency: "INR",
      tags: ["earrings", "new", "gold", "hoops"],
      images: [
        {
          url: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766225/dainty-dazzle/dainty-dazzle/06-product-earrings-model.jpg",
          altText: "Golden Aura Twisted Hoops fine jewelry",
        },
      ],
      variants: [
        {
          id: "var_01_gold",
          title: "18K Gold Vermeil",
          availableForSale: true,
          quantityAvailable: 15,
          price: "899.00",
          compareAtPrice: "1499.00",
        },
        {
          id: "var_01_silver",
          title: "Sterling Silver",
          availableForSale: true,
          quantityAvailable: 10,
          price: "849.00",
          compareAtPrice: "1399.00",
        },
      ],
      collectionIds: ["col_earrings", "col_new_arrivals"],
    },
    {
      id: "prod_02",
      handle: "celestial-freshwater-pearl-pendant",
      title: "Celestial Freshwater Pearl Pendant",
      descriptionHtml:
        "<p>An organic, luminous genuine freshwater baroque pearl suspended from a delicate Singapore twist chain. Each pearl is hand-selected and unique, embodying natural, unrepeatable grace.</p><p>Adjustable chain length: 16 to 18 inches.</p>",
      availableForSale: true,
      isActive: true,
      totalInventory: 18,
      minPrice: "1299.00",
      compareAtPrice: "1899.00",
      currency: "INR",
      tags: ["necklaces", "pearl", "sale", "bestseller"],
      images: [
        {
          url: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766223/dainty-dazzle/dainty-dazzle/05-product-pearl-details.jpg",
          altText: "Celestial Freshwater Pearl Pendant fine necklace",
        },
      ],
      variants: [
        {
          id: "var_02_gold",
          title: "Yellow Gold & Pearl",
          availableForSale: true,
          quantityAvailable: 12,
          price: "1299.00",
          compareAtPrice: "1899.00",
        },
        {
          id: "var_02_rose",
          title: "Rose Gold & Pearl",
          availableForSale: true,
          quantityAvailable: 6,
          price: "1299.00",
          compareAtPrice: "1899.00",
        },
      ],
      collectionIds: ["col_necklaces"],
    },
    {
      id: "prod_03",
      handle: "solstice-textured-huggies",
      title: "Solstice Textured Huggies",
      descriptionHtml:
        "<p>Everyday mini huggie hoops featuring an artisanal hammered texture that captures subtle reflections. Designed with a secure click clasp for seamless daily wear.</p><p>Diameter: 12mm. Crafted in anti-tarnish stainless steel with triple gold dipping.</p>",
      availableForSale: true,
      isActive: true,
      totalInventory: 30,
      minPrice: "749.00",
      compareAtPrice: "1199.00",
      currency: "INR",
      tags: ["earrings", "gold", "huggies", "bestseller"],
      images: [
        {
          url: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766219/dainty-dazzle/dainty-dazzle/03-story-section-craftsmanship.jpg",
          altText: "Solstice Textured Huggie Earrings",
        },
      ],
      variants: [
        {
          id: "var_03_default",
          title: "One Size / Gold",
          availableForSale: true,
          quantityAvailable: 30,
          price: "749.00",
          compareAtPrice: "1199.00",
        },
      ],
      collectionIds: ["col_earrings"],
    },
    {
      id: "prod_04",
      handle: "serpentine-herringbone-chain",
      title: "Serpentine Herringbone Snake Chain",
      descriptionHtml:
        "<p>Liquid gold drape. This flat-woven serpentine chain rests flush against the collarbone with mirror-like shine. Striking when worn alone or paired with delicate charms.</p><p>Width: 3mm. Length: 40cm + 5cm extension.</p>",
      availableForSale: true,
      isActive: true,
      totalInventory: 20,
      minPrice: "1199.00",
      compareAtPrice: "1699.00",
      currency: "INR",
      tags: ["necklaces", "chains", "new", "gold"],
      images: [
        {
          url: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766227/dainty-dazzle/dainty-dazzle/07-product-snake-chain.jpg",
          altText: "Serpentine Herringbone Snake Chain Necklace",
        },
      ],
      variants: [
        {
          id: "var_04_gold",
          title: "Gold - 40cm",
          availableForSale: true,
          quantityAvailable: 15,
          price: "1199.00",
          compareAtPrice: "1699.00",
        },
        {
          id: "var_04_silver",
          title: "Silver - 40cm",
          availableForSale: true,
          quantityAvailable: 5,
          price: "1099.00",
          compareAtPrice: "1599.00",
        },
      ],
      collectionIds: ["col_necklaces", "col_new_arrivals"],
    },
  ];

  for (const prod of products) {
    const { variants, collectionIds, ...productFields } = prod;

    await db
      .insert(productsTable)
      .values(productFields)
      .onConflictDoUpdate({ target: productsTable.id, set: productFields });

    for (const v of variants) {
      await db
        .insert(productVariantsTable)
        .values({ ...v, productId: prod.id, currency: "INR" })
        .onConflictDoUpdate({
          target: productVariantsTable.id,
          set: { ...v, productId: prod.id, currency: "INR" },
        });
    }

    for (const colId of collectionIds) {
      await db
        .insert(collectionProductsTable)
        .values({ collectionId: colId, productId: prod.id, sortOrder: 0 })
        .onConflictDoNothing();
    }
  }

  // 3. CMS Sections
  const cmsDefaults = [
    {
      id: "hero",
      sectionKey: "hero",
      data: {
        imageUrl: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766214/dainty-dazzle/dainty-dazzle/01-hero-banner.jpg",
        headline: "Dainty Dazzle",
        subtitle: "True beauty shines from within, and our jewelry merely reflects it.",
        ctaText: "SHOP NOW ↗",
        ctaLink: "/products",
      },
    },
    {
      id: "featured",
      sectionKey: "featured",
      data: {
        eyebrow: "Our Collection",
        headline: "Creating,\nCrafting\n& Wearing.",
        description: "Each piece is designed with care and crafted to celebrate everyday elegance. Discover jewelry that feels like it was made just for you.",
        ctaText: "EXPLORE ALL ↗",
        ctaLink: "/products",
      },
    },
    {
      id: "editorial",
      sectionKey: "editorial",
      data: {
        imageUrl: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766216/dainty-dazzle/dainty-dazzle/02-editorial-banner-elegance.jpg",
        headline: "Elegance in every detail.",
        subtitle: "Handcrafted with love, designed to be worn every single day.",
      },
    },
    {
      id: "story",
      sectionKey: "story",
      data: {
        imageUrl: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766219/dainty-dazzle/dainty-dazzle/03-story-section-craftsmanship.jpg",
        eyebrow: "Our Story",
        headline: "We believe\nin our process.",
        paragraph1: "Every piece of Dainty Dazzle jewelry is crafted with intention. From selecting materials to the final polish, we pour care into every step.",
        paragraph2: "We started with a simple belief: that beautiful jewelry shouldn't cost a fortune. Each piece is designed to celebrate quiet confidence.",
        ctaText: "EXPLORE CATEGORIES ↗",
        ctaLink: "/products",
      },
    },
    {
      id: "bottom-banner",
      sectionKey: "bottom-banner",
      data: {
        imageUrl: "https://res.cloudinary.com/io2tbyjp/image/upload/v1795766221/dainty-dazzle/dainty-dazzle/04-editorial-banner-technique.jpg",
        headline: "Emotion embraces technique.",
        subtitle: "Where craftsmanship meets quiet confidence.",
      },
    },
  ];

  for (const section of cmsDefaults) {
    await db
      .insert(cmsSectionsTable)
      .values(section)
      .onConflictDoUpdate({ target: cmsSectionsTable.id, set: section });
  }

  // 4. Initial Admin Account
  const defaultAdmin = {
    email: "ankitbhavarthe123@gmail.com",
    passwordHash: hashPassword("2003@A"),
    name: "Ankit Bhavarthe",
    role: "superadmin",
  };

  await db
    .insert(adminsTable)
    .values(defaultAdmin)
    .onConflictDoUpdate({
      target: adminsTable.email,
      set: {
        passwordHash: defaultAdmin.passwordHash,
        name: defaultAdmin.name,
        role: defaultAdmin.role,
        updatedAt: new Date(),
      },
    });

  logger.info("[ADMIN] Admin account seeded: ankitbhavarthe123@gmail.com");
  logger.info("[DB] Database seeded successfully!");
}

seed().catch((err) => {
  logger.error("[DB ERROR] Seeding failed", err);
  process.exit(1);
});
