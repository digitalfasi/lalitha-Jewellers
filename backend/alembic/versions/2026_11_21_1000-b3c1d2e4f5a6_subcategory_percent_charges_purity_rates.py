"""sub-category %, bill charges settings, purity rates, stone and HUID charges

Revision ID: b3c1d2e4f5a6
Revises: 9df42097fb4c
Create Date: 2026-11-21 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c1d2e4f5a6'
down_revision: Union[str, None] = '9df42097fb4c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MONEY = sa.Numeric(precision=14, scale=2)


def upgrade() -> None:
    with op.batch_alter_table('designs') as b:
        b.add_column(sa.Column('default_percent', sa.Numeric(precision=6, scale=2), nullable=True))
    with op.batch_alter_table('business_profile') as b:
        b.add_column(sa.Column('default_hsn', sa.String(length=8), nullable=False, server_default='7113'))
        b.add_column(sa.Column('huid_rate', MONEY, nullable=True))
        b.add_column(sa.Column('stone_rate', MONEY, nullable=True))
        b.add_column(sa.Column('show_making', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    with op.batch_alter_table('gold_rates') as b:
        b.add_column(sa.Column('purity_rates', sa.JSON(), nullable=True))
    with op.batch_alter_table('bills') as b:
        for col in ('stone_rate', 'stone_amount', 'huid_rate', 'huid_amount'):
            b.add_column(sa.Column(col, MONEY, nullable=False, server_default='0'))
        b.add_column(sa.Column('huid_pieces', sa.Integer(), nullable=False, server_default='0'))
    with op.batch_alter_table('bill_lines') as b:
        b.add_column(sa.Column('stone_amount', MONEY, nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('bill_lines') as b:
        b.drop_column('stone_amount')
    with op.batch_alter_table('bills') as b:
        for col in ('huid_pieces', 'huid_amount', 'huid_rate', 'stone_amount', 'stone_rate'):
            b.drop_column(col)
    with op.batch_alter_table('gold_rates') as b:
        b.drop_column('purity_rates')
    with op.batch_alter_table('business_profile') as b:
        for col in ('show_making', 'stone_rate', 'huid_rate', 'default_hsn'):
            b.drop_column(col)
    with op.batch_alter_table('designs') as b:
        b.drop_column('default_percent')
