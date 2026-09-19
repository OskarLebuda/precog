<script setup lang="ts">
const route = useRoute();
</script>

<template>
  <main>
    <h1>Item number {{ route.params.id }}</h1>
    <NuxtLink to="/shop">Back to the shop</NuxtLink>
  </main>
</template>
