<script setup lang="ts">
const route = useRoute();
const id = Number(route.params.id);
const related = [id + 1, id + 2, id + 3].filter((n) => n <= 40);
</script>

<template>
  <main>
    <h1>Post number {{ id }}</h1>
    <p v-for="paragraph in 6" :key="paragraph">
      Speculative loading only helps when the guess is right. This paragraph is here so the page is
      long enough to scroll, which is one of the signals the module sends.
    </p>
    <h2>Read next</h2>
    <ul>
      <li v-for="other in related" :key="other">
        <NuxtLink :to="`/blog/${other}`">Post number {{ other }}</NuxtLink>
      </li>
    </ul>
    <NuxtLink to="/blog">Back to the blog</NuxtLink>
  </main>
</template>
