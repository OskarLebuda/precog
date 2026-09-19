<script setup lang="ts">
const posts = Array.from({ length: 20 }, (_, i) => i + 1);
</script>

<template>
  <main>
    <h1>Blog</h1>
    <ul>
      <li v-for="post in posts" :key="post">
        <NuxtLink :to="`/blog/${post}`">Post number {{ post }}</NuxtLink>
      </li>
    </ul>
  </main>
</template>
