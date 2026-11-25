# Generated for the acknowledged store sync protocol.
import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0010_store_warehouse_and_storage_inventory'),
    ]

    operations = [
        migrations.AlterField(
            model_name='syncevent',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDING', 'Pending'),
                    ('AWAITING_CONFIRMATION', 'Awaiting Confirmation'),
                    ('PROCESSED', 'Processed'),
                    ('CONFLICT', 'Conflict'),
                    ('FAILED', 'Failed'),
                ],
                db_index=True,
                default='PENDING',
                max_length=50,
            ),
        ),
        migrations.CreateModel(
            name='StoreSyncState',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('device_id', models.CharField(max_length=128)),
                ('device_secret', models.CharField(max_length=128)),
                ('app_version', models.CharField(blank=True, default='', max_length=64)),
                ('last_applied_seq', models.PositiveBigIntegerField(default=0)),
                ('sync_version', models.PositiveIntegerField(default=0)),
                ('status_payload', models.JSONField(default=dict)),
                ('last_seen_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('store', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sync_states', to='inventory.store')),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=('store', 'device_id'), name='unique_store_sync_device'),
                ],
                'indexes': [
                    models.Index(fields=['store', 'last_seen_at'], name='inventory_s_store_i_822c4f_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='SyncBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('batch_id', models.UUIDField()),
                ('payload_digest', models.CharField(max_length=64)),
                ('export_payload', models.JSONField(default=dict)),
                ('status', models.CharField(choices=[('IMPORTED', 'Imported'), ('CONFIRMED', 'Confirmed')], default='IMPORTED', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('sync_state', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='batches', to='inventory.storesyncstate')),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=('sync_state', 'batch_id'), name='unique_sync_state_batch'),
                ],
                'indexes': [
                    models.Index(fields=['sync_state', 'created_at'], name='inventory_s_sync_st_77251d_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='SyncConfirm',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('confirm_id', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('checkpoint', models.PositiveBigIntegerField(default=0)),
                ('sync_version', models.PositiveIntegerField(default=0)),
                ('payload', models.JSONField(default=dict)),
                ('signature', models.CharField(max_length=64)),
                ('receipt_payload', models.JSONField(default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('acknowledged_at', models.DateTimeField(blank=True, null=True)),
                ('batch', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='confirm', to='inventory.syncbatch')),
            ],
            options={
                'indexes': [
                    models.Index(fields=['acknowledged_at', 'created_at'], name='inventory_s_acknowl_49a7d5_idx'),
                ],
            },
        ),
        migrations.CreateModel(
            name='SyncAcknowledgement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('local_seq', models.PositiveBigIntegerField(blank=True, null=True)),
                ('acknowledged_at', models.DateTimeField(blank=True, null=True)),
                ('confirm', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='acknowledgements', to='inventory.syncconfirm')),
                ('sync_event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='confirm_acknowledgements', to='inventory.syncevent')),
            ],
            options={
                'constraints': [
                    models.UniqueConstraint(fields=('confirm', 'sync_event'), name='unique_confirm_sync_event'),
                ],
                'indexes': [
                    models.Index(fields=['sync_event', 'acknowledged_at'], name='inventory_s_sync_ev_2c8108_idx'),
                ],
            },
        ),
    ]
