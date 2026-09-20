<script setup lang="ts">
const items = Array.from({ length: 10 }, (_, i) => i + 1);
</script>

<template>
  <main>
    <h1>Shop</h1>
    <ul>
      <li v-for="item in items" :key="item">
        <NuxtLink :to="`/shop/${item}`">Item number {{ item }}</NuxtLink>
      </li>
    </ul>
    <p><NuxtLink to="/cart/checkout">Checkout, on the deny list</NuxtLink></p>
  </main>
</template>
