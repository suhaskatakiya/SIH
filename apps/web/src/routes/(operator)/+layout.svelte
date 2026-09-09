<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { session } from '$lib/session.svelte';
  import OperatorNav from '$lib/components/OperatorNav.svelte';

  let { children } = $props();
  let allowed = $state(false);

  onMount(async () => {
    if (session.status !== 'authenticated' || !session.me) {
      await goto('/login');
      return;
    }
    if (session.me.role !== 'OPERATOR') {
      await goto('/dashboard');
      return;
    }
    allowed = true;
  });
</script>

{#if allowed}
  <div class="app-shell">
    <OperatorNav />
    <main class="app-main">
      <div class="container container--wide">
        {@render children()}
      </div>
    </main>
  </div>
{/if}
