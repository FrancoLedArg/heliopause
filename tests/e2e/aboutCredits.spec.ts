import { expect, test } from '@playwright/test';

test('title to About to Back to Credits to Back restores focus each time', async ({
  page,
}, testInfo) => {
  await page.goto('/?seed=5');
  const newRun = page.getByRole('button', { name: 'New Run' });
  const about = page.getByRole('button', { name: 'About' });
  const credits = page.getByRole('button', { name: 'Credits' });
  await expect(newRun).toBeVisible();
  await testInfo.attach('title', { body: await page.screenshot(), contentType: 'image/png' });

  await about.click();
  const aboutPanel = page.getByRole('region', { name: 'About' });
  await expect(aboutPanel).toBeVisible();
  await expect(aboutPanel.getByText('TEAM MEMBERS TO BE ADDED')).toBeVisible();
  await expect(aboutPanel.getByRole('link', { name: 'The challenge page' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  await expect(page.getByText('AI-generated art', { exact: true })).toBeVisible();
  await testInfo.attach('about', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(about).toBeFocused();

  await credits.click();
  const creditsPanel = page.getByRole('region', { name: 'Credits' });
  await expect(creditsPanel.getByText(/CC BY-ND 4\.0/)).toBeVisible();
  await expect(page.getByText('AI-generated art', { exact: true })).toBeVisible();
  await testInfo.attach('credits', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(credits).toBeFocused();
});

test('Esc leaves a panel and keeps the opener focused; links open in a new tab', async ({
  page,
}) => {
  await page.goto('/?seed=5');
  await page.getByRole('button', { name: 'Credits' }).click();
  const links = page.getByRole('region', { name: 'Credits' }).getByRole('link');
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Credits' })).toBeFocused();
});
