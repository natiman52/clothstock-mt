from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0011_acknowledged_sync'),
        ('user', '0002_alter_user_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='stores',
            field=models.ManyToManyField(
                blank=True,
                help_text='Store locations this user is permitted to access and synchronize.',
                related_name='assigned_users',
                to='inventory.store',
            ),
        ),
    ]
