<script setup lang="ts">
import { DOC_SLUGS, docTitle } from "#shared/docs";
</script>

<template>
  <main>
    <h1>Docs</h1>
    <p>Every page here is prerendered, so it has a payload the module can warm up.</p>
    <ul>
      <li v-for="slug in DOC_SLUGS" :key="slug">
        <NuxtLink :to="`/docs/${slug}`">{{ docTitle(slug) }}</NuxtLink>
      </li>
    </ul>
  </main>
</template>
