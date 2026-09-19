<script setup lang="ts">
definePageMeta({ precog: false });
</script>

<template>
  <main>
    <h1>Quiet page</h1>
    <p>This page opts out with <code>definePageMeta({ precog: false })</code>.</p>
    <NuxtLink to="/blog">Blog</NuxtLink>
    <NuxtLink to="/shop">Shop</NuxtLink>
  </main>
</template>
